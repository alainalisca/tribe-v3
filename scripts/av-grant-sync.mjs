#!/usr/bin/env node
/**
 * T-AV19 Parts A and C. Bring the LOCAL database's client grants into parity
 * with the production dump, and switch off every trigger that would reach
 * outside this machine.
 *
 *   node scripts/av-grant-sync.mjs        (run by `npm run db:reset`, after the load)
 *
 * PART A. The local image's default privileges give anon and authenticated
 * ALL on every table the dump creates; the dump's GRANT lines only add. So
 * this REVOKEs ALL from both roles on every public table, sequence and
 * function, then replays exactly the dump's GRANT lines for those two roles,
 * column-level ones included. One transaction.
 *
 * PART C. Production's `chat_message_webhook` fires a function that calls
 * net.http_post against a HARDCODED production URL. Loaded locally, a chat row
 * written on this machine would call production. Every trigger whose function
 * reaches outside the database (found by capability, see OUTBOUND_QUERY) is
 * disabled here, plus the named legacy push-queue triggers.
 *
 * LOCAL ONLY. The connection is refused unless it is localhost, 127.0.0.1 or
 * [::1] (scripts/avLocalDb.mjs). Nothing here is, or may become, a migration:
 * production keeps its grants and its triggers exactly as they are.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const NAME = 'av-grant-sync';

// The parsing lives in .ts modules so the unit tests exercise the same code;
// re-exec once with type stripping, the same as av-migration-check.
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
const { parseDumpGrants, buildSyncSql, parseOutboundRows, OUTBOUND_QUERY, LEGACY_PUSH_QUEUE_TRIGGERS } =
  await import(path.join(ROOT, 'supabase', 'avGrantParity.ts'));

// Refuse a non-local connection BEFORE reading anything else.
const url = localDbUrlOrExit(NAME);

const DUMP = path.join(ROOT, 'supabase', 'av-local-schema.sql');
if (!existsSync(DUMP)) {
  console.error(`${NAME} FAILED: ${path.relative(ROOT, DUMP)} does not exist. Run \`npm run av:schema:pull\`.\n`);
  process.exit(1);
}

const { replay, entries, grantLinesSeen } = parseDumpGrants(sqlWithoutComments(readFileSync(DUMP, 'utf8')));

// Assert the read succeeded before acting on it. A parse that found nothing
// would REVOKE everything and replay nothing: a database far NARROWER than
// production, which fails probes for the opposite wrong reason.
if (grantLinesSeen === 0 || replay.length === 0 || entries.length === 0) {
  console.error(
    `${NAME} FAILED: read ${grantLinesSeen} GRANT line(s) from the dump and ${replay.length} for the client roles.\n` +
      `  That is an extraction failure, not a database with no grants. Nothing was changed.\n`
  );
  process.exit(1);
}

const discovered = parseOutboundRows(runPsql(NAME, url, OUTBOUND_QUERY, { tuples: true })).filter(
  (t) => t.trigger
);
const outbound = [...discovered];
for (const legacy of LEGACY_PUSH_QUEUE_TRIGGERS) {
  if (!outbound.some((t) => t.schema === legacy.schema && t.table === legacy.table && t.trigger === legacy.trigger)) {
    outbound.push(legacy);
  }
}

runPsql(NAME, url, buildSyncSql(replay, outbound));

console.log(
  `${NAME} OK: revoked ALL from anon, authenticated on public tables, sequences, functions; ` +
    `replayed ${replay.length} GRANT line(s) (${entries.length} privilege entries) from the dump.\n` +
    `  disabled ${outbound.length} trigger(s) locally:\n` +
    outbound.map((t) => `    ${t.schema}.${t.table}.${t.trigger}  (fn ${t.fn})`).join('\n') +
    `\n  Verify with \`npm run av:schema:verify\`.`
);
