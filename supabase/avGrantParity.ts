/**
 * T-AV19 Part A. Local grant parity with the production schema dump.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The T-AV20 recon (finding F1) measured that locally `anon` held ALL on every
 * public table, while the production dump grants it less on 16 of them,
 * including pass_leads, users and sessions. So a local probe that expected a
 * refusal "by grant" on those tables proved nothing: the grant it was testing
 * did not exist here. The local image's default privileges hand out ALL when
 * the dump's CREATE TABLE runs, and the dump's GRANT lines are additive, so
 * production's narrower grants never land.
 *
 * This module is the pure half of the fix, shared by the sync script (which
 * REVOKEs and replays) and the parity check (which compares):
 *
 *   parseDumpGrants(dumpSql)   what production grants, per object, role, column
 *   buildSyncSql(grants, ...)  REVOKE ALL, replay those grants, disable triggers
 *   diffGrants(expected, got)  every difference, named, both directions
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE COMPARISON IS RAW ACL TO RAW GRANT, NOT A DERIVED VIEW
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * pg_dump writes GRANT lines FROM the ACLs (pg_class.relacl, pg_attribute.attacl,
 * pg_proc.proacl), so the local side is read from the same place with
 * aclexplode, not from information_schema.column_privileges. That view expands
 * a table-level grant into one row per column, which would make a correct
 * database look like it has hundreds of extra column grants. CLAUDE.md's rule
 * for catalog work applies: ask the object's own catalog row, keyed on the
 * object, rather than a name-filtered convenience view.
 *
 * Only `anon` and `authenticated` are compared. They are the two roles a
 * request from the internet runs as; service_role bypasses RLS entirely and
 * postgres owns everything, so drift there is not what a probe is testing.
 */

/** The two roles a PostgREST request can run as. */
export const CLIENT_ROLES = ['anon', 'authenticated'] as const;
export type ClientRole = (typeof CLIENT_ROLES)[number];

export type ObjectKind = 'table' | 'sequence' | 'function';

/**
 * What ALL expands to, per kind, on PostgreSQL 17 (the local stack reports
 * 17.6). MAINTAIN is new in 17; if production moves to a version without it the
 * parity check will say so by name rather than silently disagree.
 */
export const ALL_PRIVILEGES: Record<ObjectKind, readonly string[]> = {
  table: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'],
  sequence: ['USAGE', 'SELECT', 'UPDATE'],
  function: ['EXECUTE'],
};

/** One privilege held by one role on one object, optionally on one column. */
export interface GrantEntry {
  kind: ObjectKind;
  /** Normalized: `users`, or `pass_is_active(p_partner_id uuid, p_slug text)`. */
  object: string;
  /** null for an object-level grant. */
  column: string | null;
  role: ClientRole;
  privilege: string;
}

/** A stable key, so two sets of entries can be compared as sets of strings. */
export function grantKey(g: GrantEntry): string {
  return `${g.kind}|${g.object}|${g.column ?? '*'}|${g.role}|${g.privilege}`;
}

/** Strip identifier quotes and collapse whitespace, the same way on both sides. */
export function normalizeIdent(s: string): string {
  return s.replace(/"/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * A function signature as the catalog prints it, normalized.
 *
 * The dump writes `"public"."f"("p_a" "uuid", "p_b" "text"[])`; the catalog's
 * pg_get_function_identity_arguments writes `p_a uuid, p_b text[]`. Types in
 * `public` come back unqualified from the catalog under the default
 * search_path, so the `public.` prefix is dropped inside the argument list too.
 */
export function normalizeFunctionSignature(name: string, args: string): string {
  const a = normalizeIdent(args)
    .replace(/\bpublic\./g, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*\[\s*\]/g, '[]');
  return `${normalizeIdent(name)}(${a})`;
}

/** Split `SELECT("a"),UPDATE("a","b"),INSERT` on the commas that are not inside parentheses. */
function splitPrivilegeList(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

const PUBLIC_OBJECT = String.raw`"public"\."([^"]+)"`;

/**
 * One pg_dump GRANT statement per line, as pg_dump writes them: anchored at
 * the start of a line, and with the object as a QUOTED `"public"."name"`.
 *
 * The quoting is what excludes a GRANT written inside a function body, which
 * is dynamic SQL and not a privilege this database holds. Hand-written SQL in
 * this repo writes `public.x`; only pg_dump's own output quotes every
 * identifier. The unit test puts an unquoted GRANT at column 0 inside a body
 * to prove it. The parity check's zero NARROWER result on the real dump is the
 * other half: every GRANT this reads matched a real object.
 */
const GRANT_LINE = new RegExp(
  String.raw`^GRANT\s+(.+?)\s+ON\s+(TABLE|SEQUENCE|FUNCTION)\s+${PUBLIC_OBJECT}(\(.*\))?\s+TO\s+"?([A-Za-z_]+)"?\s*;\s*$`,
  'gm'
);

export interface ParsedDump {
  entries: GrantEntry[];
  /** Every GRANT line on a public object seen, whatever the grantee. For a read-succeeded assertion. */
  grantLinesSeen: number;
  /** The GRANT statements to replay for the client roles, verbatim from the dump. */
  replay: string[];
}

/**
 * Read the dump's grants to the client roles.
 *
 * Pass the dump through sqlWithoutComments first (the repo's one tokeniser);
 * this function does no comment handling of its own, because a second comment
 * stripper is the defect CLAUDE.md records four times.
 */
export function parseDumpGrants(dumpSql: string): ParsedDump {
  const entries: GrantEntry[] = [];
  const replay: string[] = [];
  let grantLinesSeen = 0;

  GRANT_LINE.lastIndex = 0;
  for (const m of dumpSql.matchAll(GRANT_LINE)) {
    grantLinesSeen++;
    const [line, privList, kindWord, name, args, grantee] = m;
    const role = grantee as ClientRole;
    if (!(CLIENT_ROLES as readonly string[]).includes(role)) continue;

    const kind = kindWord.toLowerCase() as ObjectKind;
    const object = kind === 'function' ? normalizeFunctionSignature(name, (args ?? '()').slice(1, -1)) : name;
    replay.push(line.trim());

    for (const item of splitPrivilegeList(privList)) {
      const col = /^([A-Z]+)\s*\((.*)\)$/.exec(item);
      if (col) {
        for (const c of col[2].split(',')) {
          entries.push({ kind, object, column: normalizeIdent(c), role, privilege: col[1] });
        }
        continue;
      }
      const privs = item === 'ALL' ? ALL_PRIVILEGES[kind] : [item];
      for (const privilege of privs) entries.push({ kind, object, column: null, role, privilege });
    }
  }
  return { entries, grantLinesSeen, replay };
}

export interface GrantDiff {
  /** In the dump, not in the local database: local is NARROWER than production. */
  missing: GrantEntry[];
  /** In the local database, not in the dump: local is WIDER than production. */
  extra: GrantEntry[];
}

/**
 * Every difference, both directions. Returned as entries rather than a count,
 * because "3 differences" is not actionable and "anon SELECT users.email" is.
 */
export function diffGrants(expected: GrantEntry[], actual: GrantEntry[]): GrantDiff {
  const want = new Map(expected.map((g) => [grantKey(g), g]));
  const have = new Map(actual.map((g) => [grantKey(g), g]));
  const missing = [...want].filter(([k]) => !have.has(k)).map(([, g]) => g);
  const extra = [...have].filter(([k]) => !want.has(k)).map(([, g]) => g);
  const order = (a: GrantEntry, b: GrantEntry) => grantKey(a).localeCompare(grantKey(b));
  return { missing: missing.sort(order), extra: extra.sort(order) };
}

/** `anon SELECT on table users (column email)` */
export function describeGrant(g: GrantEntry): string {
  return `${g.role} ${g.privilege} on ${g.kind} ${g.object}${g.column ? ` (column ${g.column})` : ''}`;
}

/** A trigger whose function reaches outside the database. */
export interface OutboundTrigger {
  schema: string;
  table: string;
  trigger: string;
  fn: string;
}

/**
 * Triggers disabled locally although they make no outbound call themselves.
 * Each carries its reason, because an exemption without one cannot be audited
 * (CLAUDE.md, the `unete` entry). The parity check fails if a name here no
 * longer exists, so the list cannot rot into a permanent no-op.
 */
export const LEGACY_PUSH_QUEUE_TRIGGERS: ReadonlyArray<OutboundTrigger & { reason: string }> = [
  {
    schema: 'public',
    table: 'chat_messages',
    trigger: 'chat_message_notification_trigger',
    fn: 'notify_new_chat_message',
    reason:
      'Legacy push path: queues a push_notifications row per participant on every chat message. ' +
      'T-AV19 Part C names it explicitly; the parent spec forbids the legacy DB push triggers as a send path.',
  },
];

/** Parse OUTBOUND_QUERY's tab-separated output (psql -tA -F tab). */
export function parseOutboundRows(tsv: string): Array<OutboundTrigger & { enabled: string | null }> {
  const out: Array<OutboundTrigger & { enabled: string | null }> = [];
  for (const line of tsv.split('\n')) {
    if (line.trim() === '') continue;
    const [fnSchema, fnName, schema, table, trigger, enabled] = line.split('\t');
    out.push({ schema, table, trigger, fn: `${fnSchema}.${fnName}`, enabled: enabled || null });
  }
  return out;
}

/**
 * The SQL that brings the local database into parity. One transaction: a
 * failure anywhere leaves the database as it was, rather than with the REVOKE
 * applied and half the grants replayed, which would be narrower than
 * production and fail probes for the opposite wrong reason.
 *
 * REVOKE ALL ON a table also revokes the column-level privileges on it
 * (PostgreSQL docs, REVOKE), so the three schema-wide REVOKEs clear everything
 * the replay then restores.
 */
export function buildSyncSql(replay: string[], outbound: OutboundTrigger[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [
    'BEGIN;',
    'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;',
    'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;',
    'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;',
    ...replay,
    ...outbound.map((t) => `ALTER TABLE ${q(t.schema)}.${q(t.table)} DISABLE TRIGGER ${q(t.trigger)};`),
    'COMMIT;',
    '',
  ].join('\n');
}

/**
 * The local side of the comparison: raw ACL entries for the client roles on
 * every public relation, column, sequence and function, via aclexplode.
 *
 * Keyed on the object's own catalog row, never on information_schema (see the
 * header). A NULL ACL means "default privileges" and aclexplode returns no
 * rows for it, which is correct: the default grants nothing to anon or
 * authenticated by name.
 *
 * Columns, tab-separated: kind, name, args (functions only), column, role, privilege.
 */
export const LOCAL_ACL_QUERY = `
with roles as (select oid, rolname from pg_roles where rolname in ('anon', 'authenticated'))
select 'table', c.relname, '', '', r.rolname, a.privilege_type
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a join roles r on r.oid = a.grantee
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
union all
select 'table', c.relname, '', att.attname, r.rolname, a.privilege_type
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute att on att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped
  cross join lateral aclexplode(att.attacl) a join roles r on r.oid = a.grantee
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
union all
select 'sequence', c.relname, '', '', r.rolname, a.privilege_type
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a join roles r on r.oid = a.grantee
  where n.nspname = 'public' and c.relkind = 'S'
union all
select 'function', p.proname, pg_get_function_identity_arguments(p.oid), '', r.rolname, a.privilege_type
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(p.proacl) a join roles r on r.oid = a.grantee
  where n.nspname = 'public';
`;

/** Parse LOCAL_ACL_QUERY's tab-separated output into entries comparable with the dump's. */
export function parseLocalAcl(tsv: string): GrantEntry[] {
  const out: GrantEntry[] = [];
  for (const line of tsv.split('\n')) {
    if (line.trim() === '') continue;
    const [kind, name, args, column, role, privilege] = line.split('\t');
    const k = kind as ObjectKind;
    out.push({
      kind: k,
      object: k === 'function' ? normalizeFunctionSignature(name, args) : name,
      column: column ? column : null,
      role: role as ClientRole,
      privilege,
    });
  }
  return out;
}

/**
 * Catalog query: every function in the database whose body reaches outside
 * it, and every trigger that fires one. Part C of T-AV19.
 *
 * Matches on the capability, not on a name (CLAUDE.md: a detector that
 * searches for a NAME answers "is this spelled the way I expected"): any call
 * into pg_net (`net.http_post`, `net.http_get`), the `http` extension
 * (`http(`, `http_post(`, `http_get(`), or a literal https:// URL. The `net`
 * and `extensions` schemas are excluded because they hold the implementations
 * of those calls, not callers of them.
 *
 * `supabase_functions` is deliberately NOT excluded. A dashboard "Database
 * Webhook" is a trigger that fires `supabase_functions.http_request`, which
 * calls pg_net; excluding that schema would hide exactly those triggers.
 *
 * Returns one row per (trigger, function); a function with no trigger comes
 * back with NULL trigger columns, so the list shows it rather than hiding it.
 */
export const OUTBOUND_QUERY = `
select n.nspname as fn_schema, p.proname as fn_name,
       tn.nspname as tbl_schema, c.relname as tbl_name, t.tgname as trigger_name,
       t.tgenabled::text as enabled
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join pg_trigger t on t.tgfoid = p.oid and not t.tgisinternal
left join pg_class c on c.oid = t.tgrelid
left join pg_namespace tn on tn.oid = c.relnamespace
where n.nspname not in ('pg_catalog', 'information_schema', 'net', 'extensions')
  and p.prokind = 'f'
  and (p.prosrc ~* 'net\\.http_(post|get)' or p.prosrc ~* '\\mhttp(_post|_get)?\\s*\\(' or p.prosrc ~* 'https://')
order by 1, 2, 3, 4, 5;
`;
