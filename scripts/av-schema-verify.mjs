#!/usr/bin/env node
/**
 * T-AV0, Step 4. Does the LOCAL database actually contain what the production
 * dump declares?
 *
 *   npm run av:schema:verify
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS: `supabase db reset` SUCCEEDS SILENTLY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Measured 2026-09-26: loading a 436 KB production dump through
 * `[db.seed] sql_paths` printed "Seeding data from ..." and "Finished
 * supabase db reset", exit 0, with no per-statement output at all. A dump that
 * half-applied would look exactly the same. That is the shape CLAUDE.md keeps
 * recording -- a green summary that is a claim about the run finishing, not
 * about what it did.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AND WHY THE OBVIOUS PROBE IS WRONG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The first attempt replayed the dump into a fresh `av_probe` database with
 * ON_ERROR_STOP=0 and counted errors. It reported **456**, grouped as 240
 * `relation does not exist`, 206 `schema does not exist`, 6 `publication does
 * not exist`. Every one of those is a property of the PROBE: `create database
 * av_probe` gives a bare Postgres, with no `auth`, `storage`, `extensions` or
 * `graphql` schema and no `supabase_realtime` publication, because those come
 * from the CLI's own "Initialising schema" step, which only runs for the
 * database it manages. A dump that applied perfectly would have produced the
 * same 456.
 *
 * So this asks the question the other way round, against the real database:
 * every object the dump DECLARES, does the catalog HAVE it. Missing objects
 * are reported by name and kind -- not counted, named, because "3 missing" is
 * not actionable and "3 missing: policy X on Y, ..." is.
 *
 * It is a completeness check over named objects. It does NOT verify column
 * types, policy predicates, function bodies or grants: an object present under
 * the right name with the wrong definition passes. Said out loud so nobody
 * reads a pass as "local matches production".
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');

// Same re-exec as av-migration-check: the repo's ONE SQL tokeniser is a .ts
// module, and a pg_dump contains `--` inside function bodies, so a regex
// comment stripper would silently eat statements.
if (!process.features.typescript) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', SELF, ...process.argv.slice(2)],
    { stdio: 'inherit' }
  );
  process.exit(r.status ?? 1);
}
const { sqlWithoutComments } = await import(path.join(ROOT, 'supabase', 'executableSql.ts'));

const DUMP = process.argv[2] ?? path.join(ROOT, 'supabase', 'av-local-schema.sql');
const CONTAINER = process.env.AV_DB_CONTAINER ?? 'supabase_db_tribe-v3-athlete';

if (!existsSync(DUMP)) {
  console.error(`av:schema:verify FAILED: ${path.relative(ROOT, DUMP)} does not exist.\n`);
  process.exit(1);
}

const sql = sqlWithoutComments(readFileSync(DUMP, 'utf8'));

const NAME = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const QUAL = String.raw`(?:(${NAME})\s*\.\s*)?(${NAME})`;
const clean = (s) => (s ?? '').replace(/^"|"$/g, '');

/** Each kind: how to read it out of the dump, and how to ask the catalog. */
const KINDS = [
  {
    kind: 'table',
    re: new RegExp(String.raw`\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${QUAL}`, 'gi'),
    key: (m) => `${clean(m[1]) || 'public'}.${clean(m[2])}`,
    query: `select table_schema||'.'||table_name from information_schema.tables where table_type='BASE TABLE'`,
  },
  {
    kind: 'view',
    re: new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+${QUAL}`, 'gi'),
    key: (m) => `${clean(m[1]) || 'public'}.${clean(m[2])}`,
    query: `select table_schema||'.'||table_name from information_schema.views`,
  },
  {
    kind: 'function',
    re: new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+${QUAL}`, 'gi'),
    key: (m) => `${clean(m[1]) || 'public'}.${clean(m[2])}`,
    query: `select n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace`,
  },
  {
    kind: 'index',
    re: new RegExp(String.raw`\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${NAME})\s+ON\s+${QUAL}`, 'gi'),
    key: (m) => `${clean(m[2]) || 'public'}.${clean(m[1])}`,
    query: `select schemaname||'.'||indexname from pg_indexes`,
  },
  {
    kind: 'trigger',
    re: new RegExp(String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+(${NAME})[\s\S]*?\bON\s+${QUAL}`, 'gi'),
    key: (m) => `${clean(m[2]) || 'public'}.${clean(m[3])}.${clean(m[1])}`,
    query: `select n.nspname||'.'||c.relname||'.'||t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal`,
  },
  {
    kind: 'policy',
    re: new RegExp(String.raw`\bCREATE\s+POLICY\s+(${NAME})\s+ON\s+${QUAL}`, 'gi'),
    key: (m) => `${clean(m[2]) || 'public'}.${clean(m[3])}.${clean(m[1])}`,
    query: `select schemaname||'.'||tablename||'.'||policyname from pg_policies`,
  },
  {
    kind: 'constraint',
    re: new RegExp(String.raw`\bALTER\s+TABLE\s+(?:ONLY\s+)?${QUAL}[\s\S]{0,200}?\bADD\s+CONSTRAINT\s+(${NAME})`, 'gi'),
    key: (m) => `${clean(m[1]) || 'public'}.${clean(m[2])}.${clean(m[3])}`,
    query: `select n.nspname||'.'||rel.relname||'.'||con.conname from pg_constraint con join pg_class rel on rel.oid=con.conrelid join pg_namespace n on n.oid=rel.relnamespace`,
  },
];

function catalog(query) {
  const r = spawnSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-tA', '-c', query],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error(
      `av:schema:verify FAILED: could not query the local database in container ` +
        `"${CONTAINER}".\n${(r.stderr ?? '').trim()}\n\n` +
        `  Is the stack up? \`npm run db:start\`. Override the container name with\n` +
        `  AV_DB_CONTAINER if the project directory was renamed.\n`
    );
    process.exit(1);
  }
  return new Set(
    (r.stdout ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

let missingTotal = 0;
const rows = [];

for (const { kind, re, key, query } of KINDS) {
  re.lastIndex = 0;
  const declared = new Set([...sql.matchAll(re)].map(key));
  const present = catalog(query);
  const missing = [...declared].filter((d) => !present.has(d)).sort();
  missingTotal += missing.length;
  rows.push({ kind, declared: declared.size, missing });
}

// Print what was READ, per kind, not only the verdict. A verify that emits
// only PASS cannot be checked from outside, and "0 declared" is visibly absurd
// in a way that "PASS" is not.
console.log(`av:schema:verify  dump=${path.relative(ROOT, DUMP)}  db=${CONTAINER}\n`);
for (const { kind, declared, missing } of rows) {
  console.log(
    `  ${kind.padEnd(11)} declared ${String(declared).padStart(4)}   missing ${String(missing.length).padStart(3)}` +
      (missing.length ? `\n      ${missing.join('\n      ')}` : '')
  );
}

if (rows.some((r) => r.declared === 0)) {
  console.error(
    `\nav:schema:verify FAILED: a kind read ZERO declarations out of the dump.\n` +
      `  That is an extraction failure, not an empty schema -- assert the read\n` +
      `  succeeded before believing anything it says about what it found.\n`
  );
  process.exit(1);
}

if (missingTotal > 0) {
  console.error(`\nav:schema:verify FAILED: ${missingTotal} declared object(s) are not in the local database.\n`);
  process.exit(1);
}

console.log(
  `\nav:schema:verify OK: every declared object is present.\n` +
    `  NAMES ONLY. Column types, policy predicates, function bodies and grants\n` +
    `  are not compared -- an object present under the right name with the wrong\n` +
    `  definition passes this.\n`
);
