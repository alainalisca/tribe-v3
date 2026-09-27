/**
 * T-AV19. The one way the T-AV scripts open a connection to Postgres.
 *
 * It refuses anything that is not this machine. The sync script REVOKEs every
 * client grant on the public schema and disables triggers; pointed at
 * production by a stray AV_DB_URL, that is an outage. So the host is checked
 * here, once, before any SQL is sent, rather than trusted to each caller.
 *
 *   AV_DB_URL   optional; defaults to the local stack's Postgres (54322)
 */
import { spawnSync } from 'node:child_process';

export const DEFAULT_LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** True only for a loopback host. Parsing failure is not local. */
export function isLocalDbUrl(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The URL to use, or exit with a refusal that names what was refused and why. */
export function localDbUrlOrExit(scriptName) {
  const url = process.env.AV_DB_URL || DEFAULT_LOCAL_DB_URL;
  if (!isLocalDbUrl(url)) {
    let host = '(unparseable)';
    try {
      host = new URL(url).hostname;
    } catch {
      /* host stays "(unparseable)"; the refusal below is the handling */
    }
    console.error(
      `${scriptName} REFUSED: AV_DB_URL points at "${host}", not this machine.\n` +
        `  This script changes grants and disables triggers. It runs against the\n` +
        `  LOCAL stack only (localhost, 127.0.0.1 or [::1]), never production.\n`
    );
    process.exit(1);
  }
  return url;
}

/**
 * Run SQL through psql. ON_ERROR_STOP so a failure is an exit code, not a line
 * of stderr followed by exit 0. Returns stdout; exits on any failure.
 */
export function runPsql(scriptName, url, sql, { tuples = false } = {}) {
  const args = ['-X', '-v', 'ON_ERROR_STOP=1', '-d', url];
  if (tuples) args.push('-tA', '-F', '\t');
  const r = spawnSync('psql', args, { input: sql, encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    console.error(
      `${scriptName} FAILED: psql ${r.error ? `could not start (${r.error.message})` : `exited ${r.status}`}.\n` +
        `${(r.stderr ?? '').trim()}\n\n` +
        `  Is the stack up? \`npm run db:start\`. Is psql installed? (\`brew install libpq\`)\n`
    );
    process.exit(1);
  }
  return r.stdout ?? '';
}
