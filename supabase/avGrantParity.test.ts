/**
 * T-AV19 Part A. The pure half of local grant parity.
 *
 * Fixtures are pg_dump-shaped lines copied from supabase/av-local-schema.sql
 * (production, 2026-09-26), so a parser that drifts from what pg_dump actually
 * writes fails here rather than silently reading zero grants from the dump.
 */
import { describe, it, expect } from 'vitest';
import {
  parseDumpGrants,
  parseLocalAcl,
  diffGrants,
  buildSyncSql,
  normalizeFunctionSignature,
  parseOutboundRows,
  LEGACY_PUSH_QUEUE_TRIGGERS,
  type GrantEntry,
} from './avGrantParity';
import { sqlWithoutComments } from './executableSql';

const DUMP = [
  'GRANT ALL ON TABLE "public"."pass_leads" TO "service_role";',
  'GRANT INSERT ON TABLE "public"."pass_leads" TO "anon";',
  'GRANT SELECT,INSERT ON TABLE "public"."pass_leads" TO "authenticated";',
  'GRANT SELECT("id") ON TABLE "public"."users" TO "anon";',
  'GRANT INSERT("id"),UPDATE("id") ON TABLE "public"."sessions" TO "authenticated";',
  'GRANT ALL ON TABLE "public"."notifications" TO "anon";',
  'GRANT ALL ON FUNCTION "public"."pass_is_active"("p_partner_id" "uuid", "p_slug" "text") TO "anon";',
  'GRANT ALL ON FUNCTION "public"."complete_athlete_setup"("p_sports" "text"[]) TO "authenticated";',
  '-- GRANT ALL ON TABLE "public"."users" TO "anon";',
  'CREATE FUNCTION "public"."f"() RETURNS void AS $$',
  'BEGIN',
  'GRANT ALL ON TABLE public.x TO anon;',
  'END $$ LANGUAGE plpgsql;',
].join('\n');

const keyed = (list: GrantEntry[]) =>
  list.map((g) => `${g.role} ${g.privilege} ${g.kind}:${g.object}${g.column ? `.${g.column}` : ''}`).sort();

describe('parseDumpGrants', () => {
  const parsed = parseDumpGrants(sqlWithoutComments(DUMP));

  it('reads table, column and function grants for the client roles only', () => {
    const k = keyed(parsed.entries);
    expect(k).toContain('anon INSERT table:pass_leads');
    expect(k).toContain('authenticated SELECT table:pass_leads');
    expect(k).toContain('anon SELECT table:users.id');
    expect(k).toContain('authenticated INSERT table:sessions.id');
    expect(k).toContain('authenticated UPDATE table:sessions.id');
    expect(k).toContain('anon EXECUTE function:pass_is_active(p_partner_id uuid, p_slug text)');
    expect(k).toContain('authenticated EXECUTE function:complete_athlete_setup(p_sports text[])');
    // service_role is not a client role
    expect(k.some((s) => s.startsWith('service_role'))).toBe(false);
  });

  it('expands ALL on a table to the eight PostgreSQL 17 privileges', () => {
    const notif = parsed.entries.filter((g) => g.object === 'notifications' && g.role === 'anon');
    expect(notif.map((g) => g.privilege).sort()).toEqual(
      ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'].sort()
    );
  });

  it('ignores a GRANT in a comment and one inside a function body', () => {
    // The commented line would grant anon table-level users; the body grant is dynamic SQL.
    const k = keyed(parsed.entries);
    expect(k).not.toContain('anon SELECT table:users');
    expect(k.some((s) => s.includes('table:x'))).toBe(false);
  });

  it('counts every GRANT line it saw, so an empty read is detectable', () => {
    expect(parsed.grantLinesSeen).toBe(8);
    expect(parsed.replay).toHaveLength(7);
  });
});

describe('normalizeFunctionSignature', () => {
  it('makes the dump form and the catalog form identical', () => {
    expect(normalizeFunctionSignature('"pass_is_active"', '"p_partner_id" "uuid", "p_slug" "text"')).toBe(
      normalizeFunctionSignature('pass_is_active', 'p_partner_id uuid, p_slug text')
    );
    expect(normalizeFunctionSignature('f', '"a" "public"."my_type"[]')).toBe('f(a my_type[])');
  });
});

describe('diffGrants against the local ACL', () => {
  const expected = parseDumpGrants(sqlWithoutComments(DUMP)).entries;

  it('reports nothing when local equals the dump', () => {
    const local = expected.map((g) =>
      [
        g.kind,
        g.kind === 'function' ? g.object.replace(/\(.*$/, '') : g.object,
        g.kind === 'function' ? g.object.replace(/^[^(]*\(|\)$/g, '') : '',
        g.column ?? '',
        g.role,
        g.privilege,
      ].join('\t')
    );
    const d = diffGrants(expected, parseLocalAcl(local.join('\n')));
    expect(d.missing).toEqual([]);
    expect(d.extra).toEqual([]);
  });

  it('names the F1 drift: anon holding UPDATE on pass_leads and SELECT on users.email', () => {
    const local = parseLocalAcl(
      [
        'table\tpass_leads\t\t\tanon\tINSERT',
        'table\tpass_leads\t\t\tanon\tUPDATE',
        'table\tusers\t\temail\tanon\tSELECT',
      ].join('\n')
    );
    const d = diffGrants(expected, local);
    const extra = keyed(d.extra);
    expect(extra).toContain('anon UPDATE table:pass_leads');
    expect(extra).toContain('anon SELECT table:users.email');
  });

  it('reports the narrower direction too', () => {
    const d = diffGrants(expected, []);
    expect(keyed(d.missing)).toContain('anon INSERT table:pass_leads');
  });
});

describe('buildSyncSql', () => {
  const sql = buildSyncSql(
    ['GRANT INSERT ON TABLE "public"."pass_leads" TO "anon";'],
    [{ schema: 'public', table: 'chat_messages', trigger: 'chat_message_webhook', fn: 'public.x' }]
  );

  it('revokes before it replays, inside one transaction', () => {
    const revoke = sql.indexOf('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;');
    const grant = sql.indexOf('GRANT INSERT ON TABLE');
    expect(sql.startsWith('BEGIN;')).toBe(true);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
    expect(sql).toContain('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;');
  });

  it('disables each outbound trigger by quoted name', () => {
    expect(sql).toContain('ALTER TABLE "public"."chat_messages" DISABLE TRIGGER "chat_message_webhook";');
  });
});

describe('outbound triggers', () => {
  it('parses a trigger row and a function with no trigger', () => {
    const rows = parseOutboundRows(
      'public\tnotify_chat_message_webhook\tpublic\tchat_messages\tchat_message_webhook\tO\n' +
        'supabase_functions\thttp_request\t\t\t\t\n'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ table: 'chat_messages', trigger: 'chat_message_webhook', enabled: 'O' });
    expect(rows[1].trigger).toBe('');
  });

  it('every named legacy trigger carries a reason', () => {
    for (const t of LEGACY_PUSH_QUEUE_TRIGGERS) expect(t.reason.length).toBeGreaterThan(20);
  });
});
