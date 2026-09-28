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
  applyPostDumpChanges,
  staleOverrides,
  capabilityQuery,
  LEGACY_PUSH_QUEUE_TRIGGERS,
  POST_DUMP_PRODUCTION_CHANGES,
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

describe('post-dump production changes (the dump is a snapshot)', () => {
  const ADMIN_DELETE_ANON: GrantEntry = {
    kind: 'function',
    object: 'admin_delete_user(p_target_user_id uuid)',
    column: null,
    role: 'anon',
    privilege: 'EXECUTE',
  };
  const ONLY_196 = POST_DUMP_PRODUCTION_CHANGES.filter((c) => c.id.startsWith('196_'));
  const SNAPSHOT: GrantEntry[] = [
    ADMIN_DELETE_ANON,
    { kind: 'table', object: 'pass_leads', column: null, role: 'anon', privilege: 'INSERT' },
  ];

  it('196 removes anon EXECUTE on admin_delete_user from what production is expected to hold', () => {
    const now = keyed(applyPostDumpChanges(SNAPSHOT, ONLY_196));
    expect(now).not.toContain('anon EXECUTE function:admin_delete_user(p_target_user_id uuid)');
    expect(now).toContain('anon INSERT table:pass_leads');
  });

  it('the 196 entry matches the dump spelling of the grant it removes', () => {
    // Parsed from the real dump line, so a typo in `removes` cannot silently remove nothing.
    const line = 'GRANT ALL ON FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") TO "anon";';
    const parsed = parseDumpGrants(line).entries;
    expect(staleOverrides(parsed, ONLY_196)).toEqual([]);
    expect(applyPostDumpChanges(parsed, ONLY_196)).toEqual([]);
  });

  it('flags an entry as stale once a re-pulled dump no longer carries the grant', () => {
    const repulled = SNAPSHOT.filter((g) => g !== ADMIN_DELETE_ANON);
    expect(staleOverrides(repulled, ONLY_196)).toEqual(['196_admin_delete_user_revoke_anon']);
  });

  it('the sync applies the change AFTER replaying the dump, so production wins over the snapshot', () => {
    const sql = buildSyncSql(
      ['GRANT ALL ON FUNCTION "public"."admin_delete_user"("p_target_user_id" "uuid") TO "anon";'],
      []
    );
    const replayAt = sql.indexOf('GRANT ALL ON FUNCTION');
    const revokeAt = sql.indexOf('revoke all on function public.admin_delete_user(uuid) from anon;');
    expect(replayAt).toBeGreaterThan(-1);
    expect(revokeAt).toBeGreaterThan(replayAt);
  });

  it('every entry says when and where it came from, and what production verifiably allows', () => {
    for (const c of POST_DUMP_PRODUCTION_CHANGES) {
      expect(c.appliedToProductionOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.source.length).toBeGreaterThan(40);
      expect(c.sql.length).toBeGreaterThan(0);
      expect(c.capabilities.length).toBeGreaterThan(0);
    }
  });

  it('the 197 entry removes exactly the six anon grants the dump has, spelled as the dump spells them', () => {
    // Copied from supabase/av-local-schema.sql (production, 2026-09-26), lines 10301-10665.
    const lines = [
      'GRANT ALL ON FUNCTION "public"."finalize_payment"("p_gateway_payment_id" "text", "p_expected_amount_cents" bigint, "p_gateway" "text", "p_new_status" "text") TO "anon";',
      'GRANT ALL ON FUNCTION "public"."instructor_revenue_buckets"("p_user_id" "uuid", "p_period_start_date" "date", "p_period_end_date" "date", "p_group_by" "text", "p_timezone" "text") TO "anon";',
      'GRANT ALL ON FUNCTION "public"."instructor_revenue_totals"("p_user_id" "uuid", "p_period_start_date" "date", "p_period_end_date" "date", "p_timezone" "text") TO "anon";',
      'GRANT ALL ON FUNCTION "public"."list_gym_coaches"("p_gym_id" "uuid") TO "anon";',
      'GRANT ALL ON FUNCTION "public"."review_venue_request"("p_session_id" "uuid", "p_decision" "text") TO "anon";',
      'GRANT ALL ON FUNCTION "public"."set_session_partner"("p_session_id" "uuid", "p_partner_id" "uuid") TO "anon";',
    ];
    const parsed = parseDumpGrants(lines.join('\n')).entries;
    expect(parsed).toHaveLength(6);
    const only197 = POST_DUMP_PRODUCTION_CHANGES.filter((c) => c.id.startsWith('197_'));
    expect(staleOverrides(parsed, only197)).toEqual([]);
    expect(applyPostDumpChanges(parsed, only197)).toEqual([]);
  });

  it('197 keeps finalize_payment server-only and the other five open to signed-in users', () => {
    const c197 = POST_DUMP_PRODUCTION_CHANGES.find((c) => c.id.startsWith('197_'))!;
    const can = (fn: string, role: string) => c197.capabilities.find((c) => c.fn === fn && c.role === role)?.canExecute;
    expect(c197.capabilities).toHaveLength(18);
    expect(can('public.finalize_payment(text,bigint,text,text)', 'authenticated')).toBe(false);
    expect(can('public.list_gym_coaches(uuid)', 'authenticated')).toBe(true);
    for (const c of c197.capabilities.filter((c) => c.role === 'anon')) expect(c.canExecute).toBe(false);
    for (const c of c197.capabilities.filter((c) => c.role === 'service_role')) expect(c.canExecute).toBe(true);
  });

  it('the capability query asks one has_function_privilege per check', () => {
    const sql = capabilityQuery();
    const total = POST_DUMP_PRODUCTION_CHANGES.flatMap((c) => c.capabilities).length;
    expect(sql.match(/has_function_privilege\(/g)).toHaveLength(total);
    expect(sql).toContain(
      "has_function_privilege('service_role', 'public.admin_delete_user(uuid)'::regprocedure, 'EXECUTE')"
    );
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
