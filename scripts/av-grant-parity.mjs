#!/usr/bin/env node
/**
 * T-AV19 Parts A and C, the check half. Run by `npm run av:schema:verify`.
 *
 *   node scripts/av-grant-parity.mjs
 *
 * 1. GRANT PARITY. For every public table, column, sequence and function, and
 *    each of anon and authenticated, compare the local raw ACL to the dump's
 *    GRANT lines. Any difference fails, named: role, privilege, object, column,
 *    and which side has it. Per object, never a count (T-AV19 A.2).
 * 2. OUTBOUND TRIGGERS. Fail if any trigger whose function reaches outside the
 *    database, or any named legacy push-queue trigger, is enabled locally.
 *    Fail too if a named legacy trigger no longer exists, so that list cannot
 *    rot into a no-op.
 *
 * It prints what it read before the verdict: how many dump entries, how many
 * local entries, per kind. A parity check that read zero entries on both sides
 * would agree perfectly, which is why an empty read is its own failure.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const NAME = 'av-grant-parity';

if (!process.features.typescript) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', SELF, ...process.argv.slice(2)],
    { stdio: 'inherit' }
  );
  process.exit(r.status ?? 1);
}

const { localDbUrlOrExit, runPsql } = await import(path.join(ROOT, 'scripts', 'avLocalDb.mjs'));
const { sqlWithoutComments } = await import(path.join(ROOT, 'supabase', 'executableSql.ts'));
const {
  parseDumpGrants,
  parseLocalAcl,
  diffGrants,
  describeGrant,
  parseOutboundRows,
  applyPostDumpChanges,
  parseDumpObjects,
  partitionByDeclared,
  staleOverrides,
  capabilityQuery,
  POST_DUMP_PRODUCTION_CHANGES,
  LOCAL_ACL_QUERY,
  OUTBOUND_QUERY,
  LEGACY_PUSH_QUEUE_TRIGGERS,
} = await import(path.join(ROOT, 'supabase', 'avGrantParity.ts'));

const url = localDbUrlOrExit(NAME);
const DUMP = process.argv[2] ?? path.join(ROOT, 'supabase', 'av-local-schema.sql');
if (!existsSync(DUMP)) {
  console.error(`${NAME} FAILED: ${path.relative(ROOT, DUMP)} does not exist.\n`);
  process.exit(1);
}

const dumpEntries = parseDumpGrants(sqlWithoutComments(readFileSync(DUMP, 'utf8'))).entries;
// Production as it is NOW: the dump, plus changes made in production after it
// was pulled (POST_DUMP_PRODUCTION_CHANGES in supabase/avGrantParity.ts).
const expected = applyPostDumpChanges(dumpEntries);
// Compare only objects the production dump declares. Objects created by this
// branch's own 8000-block migrations do not exist in production; they are
// listed below, never silently dropped (see parseDumpObjects).
const declaredObjects = parseDumpObjects(sqlWithoutComments(readFileSync(DUMP, 'utf8')));
const { declared: actual, notInDump } = partitionByDeclared(
  parseLocalAcl(runPsql(NAME, url, LOCAL_ACL_QUERY, { tuples: true })),
  declaredObjects
);

const count = (list, kind) => list.filter((g) => g.kind === kind).length;
console.log(`${NAME}  dump=${path.relative(ROOT, DUMP)}  db=${new URL(url).host}\n`);
for (const kind of ['table', 'sequence', 'function']) {
  console.log(
    `  ${kind.padEnd(9)} expected ${String(count(expected, kind)).padStart(5)}   local ${String(count(actual, kind)).padStart(5)}`
  );
}
console.log(
  `  post-dump production changes applied on top of the dump: ${POST_DUMP_PRODUCTION_CHANGES.length}` +
    POST_DUMP_PRODUCTION_CHANGES.map((c) => `\n    ${c.id} (${c.appliedToProductionOn})`).join('')
);

const notInDumpObjects = [...new Set(notInDump.map((g) => `${g.kind} ${g.object}`))].sort();
console.log(
  `  objects the dump declares: ${declaredObjects.size}; local objects NOT in the dump (branch-created, not compared): ${notInDumpObjects.length}` +
    notInDumpObjects.map((o) => `\n    ${o}`).join('')
);

const problems = [];

if (declaredObjects.size === 0) {
  problems.push('read 0 declared objects from the dump; an extraction failure would exclude everything from comparison.');
}

// Capabilities production is VERIFIED to have after each post-dump change,
// asked with has_function_privilege, which sees PUBLIC's default grant that the
// ACL comparison above cannot (a function with no REVOKE FROM PUBLIC).
const wanted = POST_DUMP_PRODUCTION_CHANGES.flatMap((c) => c.capabilities);
const got = runPsql(NAME, url, capabilityQuery(), { tuples: true })
  .split('\n')
  .filter((l) => l.trim() !== '');
console.log(`  capability checks from post-dump changes: ${got.length} of ${wanted.length} read`);
if (got.length !== wanted.length) {
  problems.push(`capability checks: read ${got.length} rows for ${wanted.length} checks; the query is wrong.`);
}
for (const line of got) {
  const [fn, role, can] = line.split('\t');
  const want = wanted.find((c) => c.fn === fn && c.role === role);
  if (!want) {
    problems.push(`capability check returned an unexpected row: ${line}`);
  } else if ((can === 'true') !== want.canExecute) {
    problems.push(
      `${role} ${can === 'true' ? 'CAN' : 'CANNOT'} execute ${fn}; production ${want.canExecute ? 'can' : 'cannot'}.`
    );
  }
}

for (const id of staleOverrides(dumpEntries)) {
  problems.push(
    `post-dump change ${id} is already reflected in the dump. The dump was re-pulled after it; ` +
      `delete the entry from POST_DUMP_PRODUCTION_CHANGES.`
  );
}

if (expected.length === 0 || actual.length === 0) {
  problems.push(
    `read ${expected.length} dump entries and ${actual.length} local entries. ` +
      `An empty side is an extraction failure, not parity.`
  );
}

const { missing, extra } = diffGrants(expected, actual);
for (const g of extra) problems.push(`WIDER than production: ${describeGrant(g)}`);
for (const g of missing) problems.push(`NARROWER than production: ${describeGrant(g)}`);

// ── Part C ──────────────────────────────────────────────────────────────────
const rows = parseOutboundRows(runPsql(NAME, url, OUTBOUND_QUERY, { tuples: true }));
const triggerRows = rows.filter((t) => t.trigger);
console.log(`\n  outbound functions ${rows.length}, triggers firing them ${triggerRows.length}`);
for (const t of rows) {
  console.log(
    `    ${t.fn}` + (t.trigger ? `  <- ${t.schema}.${t.table}.${t.trigger}  enabled=${t.enabled}` : '  (no trigger)')
  );
}
for (const t of triggerRows) {
  // tgenabled: O = origin (on), D = disabled, R = replica only, A = always.
  if (t.enabled !== 'D') problems.push(`outbound trigger ENABLED locally: ${t.schema}.${t.table}.${t.trigger} (fn ${t.fn})`);
}

for (const legacy of LEGACY_PUSH_QUEUE_TRIGGERS) {
  const out = runPsql(
    NAME,
    url,
    `select t.tgenabled::text from pg_trigger t join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = '${legacy.schema}' and c.relname = '${legacy.table}' and t.tgname = '${legacy.trigger}';`,
    { tuples: true }
  ).trim();
  console.log(`    legacy ${legacy.schema}.${legacy.table}.${legacy.trigger}  enabled=${out || '(absent)'}`);
  if (out === '') {
    problems.push(
      `legacy trigger ${legacy.schema}.${legacy.table}.${legacy.trigger} no longer exists. ` +
        `Remove it from LEGACY_PUSH_QUEUE_TRIGGERS; it is guarding nothing.`
    );
  } else if (out !== 'D') {
    problems.push(`legacy push-queue trigger ENABLED locally: ${legacy.schema}.${legacy.table}.${legacy.trigger}`);
  }
}

if (problems.length > 0) {
  console.error(`\n${NAME} FAILED: ${problems.length} problem(s)\n\n  - ${problems.join('\n  - ')}\n`);
  console.error(`  Fix with \`node scripts/av-grant-sync.mjs\` (it runs as part of \`npm run db:reset\`).\n`);
  process.exit(1);
}

console.log(
  `\n${NAME} OK: every anon/authenticated privilege on public tables, columns, sequences and functions ` +
    `matches production (the dump plus ${POST_DUMP_PRODUCTION_CHANGES.length} post-dump change(s)), ` +
    `and every outbound trigger is disabled locally.`
);
