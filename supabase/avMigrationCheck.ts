/**
 * T-AV0, Step 3. The tripwire over the T-AV migration block (8000-8999).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A SEPARATE CHECK AT ALL: MAIN'S GUARDS CANNOT SEE FOUR-DIGIT FILES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every migration guard on `main` keys on a THREE-digit prefix, measured
 * 2026-09-25 by reading each file rather than assuming:
 *
 *   verify-migration-state.test.ts   /^\d{3}_.*\.sql$/   coverage + duplicates
 *   migrationImmutability.test.ts    /^(\d{3})_/         frozen-hash check
 *   migrationAppliedBeforeCode.test.ts /^(\d{3})_/       applied-before-code
 *
 * `8000_foo.sql` matches none of them -- `^(\d{3})_` needs an underscore at
 * offset 3 and there is a digit there. That is exactly why the reserved block
 * keeps T-AV out of main's sequence, and exactly why it is unguarded: the
 * price of not colliding is that nothing on main is watching. This file is
 * what watches, and it has to carry the probe requirement itself because the
 * coverage test will never ask.
 *
 * It is a TRIPWIRE, NOT A PROOF (T-AV0 Step 3 says so in those words). It
 * reads text. It cannot tell you a migration is safe; it can tell you a
 * migration is obviously unsafe, and it is cheap enough to run on every push.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IT REFUSES, AND THE ONE DISHONEST ESCAPE IT CLOSES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * For every 8000-8999 migration: a `-- PROGRAM: T-AV` line and a
 * `-- TICKET: T-AVn` line in the LEADING comment block; an owner line for
 * every table it creates or alters; no DROP TABLE, DROP COLUMN or RENAME; and
 * a probe in verify-migration-state.sql.
 *
 * The cheapest way to satisfy all of that without doing any of it is to number
 * a T-AV migration 193 instead of 8000, where this file never looks. So the
 * last rule runs over EVERY migration regardless of number: a file whose
 * header claims `-- PROGRAM: T-AV` and whose number is outside the block is a
 * failure. See CLAUDE.md, "spend one more minute asking how you would satisfy
 * it dishonestly, and assert against that too".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * COMMENTS ARE STRIPPED WITH THE REPO'S TOKENISER, NOT A REGEX
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A migration header that says "no DROP COLUMN in this file" must not fail the
 * DROP COLUMN check. This repo has now had FOUR guards match their own
 * author's prose (CLAUDE.md lists them), the most recent of which turned main
 * red over the English word "so". `sqlWithoutComments` already exists for this
 * and is a tokeniser, so string literals containing `--` survive it. Nothing
 * here re-implements it -- a fifth copy is the defect, not the fix.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { sqlWithoutComments } from './executableSql.ts';

/** The reserved block. T-OS owns 9000+; main owns the three-digit sequence. */
export const AV_BLOCK_MIN = 8000;
export const AV_BLOCK_MAX = 8999;

/** Who owns a table a T-AV migration touches. Anything else is a failure. */
export const OWNERS = ['consumer', 'tribe-os', 't-av-new'] as const;

export interface AvMigrationProblem {
  file: string;
  rule: string;
  detail: string;
}

export interface AvMigrationCheckResult {
  /** 8000-8999 migration filenames that were inspected. */
  checked: string[];
  problems: AvMigrationProblem[];
}

/** `8000_foo.sql` -> 8000. Null for anything that is not a numbered migration. */
export function migrationNumber(file: string): number | null {
  const m = /^(\d+)_.+\.sql$/.exec(basename(file));
  return m ? Number(m[1]) : null;
}

/**
 * The leading comment block: every line up to the first line that is neither
 * blank nor a `--` comment.
 *
 * Anchored at the top ON PURPOSE. A `-- PROGRAM: T-AV` line appended at the
 * bottom of a 400-line file satisfies a "does this string appear" check while
 * telling a reader opening the file nothing at all, and the header exists to
 * be read by whoever is about to run the thing.
 */
export function headerBlock(src: string): string {
  const out: string[] = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    if (t === '' || t.startsWith('--')) {
      out.push(line);
      continue;
    }
    break;
  }
  return out.join('\n');
}

/** A schema-qualified or bare table name, quoted or not. */
const NAME = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|[A-Za-z_][\w$]*))?`;

const CREATE_TABLE = new RegExp(
  String.raw`\bCREATE\s+(?:UNLOGGED\s+|TEMP\s+|TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${NAME})`,
  'gi'
);
const ALTER_TABLE = new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${NAME})`, 'gi');

/** `public.Sessions` and `"sessions"` are the same table for owner-line purposes. */
function bareName(raw: string): string {
  const last = raw.split('.').pop() ?? raw;
  return last.trim().replace(/^"|"$/g, '').toLowerCase();
}

/** Every table the EXECUTABLE sql creates or alters, bare-named and deduped. */
export function tablesTouched(executable: string): string[] {
  const found = new Set<string>();
  for (const re of [CREATE_TABLE, ALTER_TABLE]) {
    re.lastIndex = 0;
    for (const m of executable.matchAll(re)) found.add(bareName(m[1]));
  }
  return [...found].sort();
}

/** `-- TABLE: public.sessions OWNER: consumer` -> { sessions: 'consumer' }. */
export function ownerLines(header: string): Map<string, string> {
  const owners = new Map<string, string>();
  const re = /^\s*--\s*TABLE:\s*(\S+)\s+OWNER:\s*(\S+)\s*$/gim;
  for (const m of header.matchAll(re)) owners.set(bareName(m[1]), m[2].toLowerCase());
  return owners;
}

/**
 * Statements a T-AV migration may not contain. Additive by default (Step 3):
 * anything destructive is a new migration on main's sequence after the merge,
 * reviewed on its own, not something that rides in on a feature branch.
 */
const FORBIDDEN: Array<{ rule: string; re: RegExp }> = [
  { rule: 'DROP TABLE', re: /\bDROP\s+TABLE\b/gi },
  { rule: 'DROP COLUMN', re: /\bDROP\s+COLUMN\b/gi },
  { rule: 'RENAME', re: /\bRENAME\b/gi },
];

/**
 * Line number in the comment-stripped text. Approximate for a file using C-style
 * block comments, which take their newlines with them when they are stripped --
 * said out loud rather than left for someone to discover, because a line number
 * that is quietly wrong is worse than one labelled approximate.
 */
function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function checkOne(file: string, src: string, verifierSql: string): AvMigrationProblem[] {
  const problems: AvMigrationProblem[] = [];
  const add = (rule: string, detail: string) => problems.push({ file, rule, detail });

  const header = headerBlock(src);
  const executable = sqlWithoutComments(src);
  const id = basename(file).replace(/\.sql$/, '');

  if (!/^\s*--\s*PROGRAM:\s*T-AV\s*$/m.test(header)) {
    add('header', 'leading comment block has no `-- PROGRAM: T-AV` line');
  }
  if (!/^\s*--\s*TICKET:\s*T-AV\d+\b/m.test(header)) {
    add('header', 'leading comment block has no `-- TICKET: T-AVn` line');
  }

  for (const { rule, re } of FORBIDDEN) {
    re.lastIndex = 0;
    for (const m of executable.matchAll(re)) {
      add(rule, `forbidden statement at ~line ${lineOf(executable, m.index ?? 0)}`);
    }
  }

  const owners = ownerLines(header);
  for (const table of tablesTouched(executable)) {
    const owner = owners.get(table);
    if (!owner) {
      add('owner', `creates or alters "${table}" with no \`-- TABLE: ${table} OWNER: ...\` line`);
    } else if (!(OWNERS as readonly string[]).includes(owner)) {
      add('owner', `"${table}" has owner "${owner}"; expected one of ${OWNERS.join(', ')}`);
    }
  }
  for (const [table, owner] of owners) {
    if (!(OWNERS as readonly string[]).includes(owner)) continue;
    if (!tablesTouched(executable).includes(table)) {
      add('owner', `owner line for "${table}" but the file never creates or alters it`);
    }
  }

  // The probe. Quoted, and in the verifier's EXECUTABLE text -- an id that
  // appears only in one of that file's comments is a probe nobody runs.
  if (!new RegExp(`['"]${id}['"]`).test(verifierSql)) {
    add('probe', `no '${id}' probe in supabase/verify-migration-state.sql`);
  }

  return problems;
}

/**
 * Walk the migrations directory. `dir` and `verifier` are parameters so the
 * unit tests can point it at a fixture directory instead of the real one --
 * sample offending files must NOT live in supabase/migrations/, where every
 * other guard in the repo would enumerate them as real migrations.
 */
export function checkAvMigrations(dir: string, verifier: string): AvMigrationCheckResult {
  const verifierSql = existsSync(verifier) ? sqlWithoutComments(readFileSync(verifier, 'utf8')) : '';
  const checked: string[] = [];
  const problems: AvMigrationProblem[] = [];

  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
    : [];

  for (const f of files) {
    const n = migrationNumber(f);
    if (n === null) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    const claimsAv = /^\s*--\s*PROGRAM:\s*T-AV\s*$/m.test(headerBlock(src));
    const inBlock = n >= AV_BLOCK_MIN && n <= AV_BLOCK_MAX;

    if (claimsAv && !inBlock) {
      problems.push({
        file: f,
        rule: 'block',
        detail:
          `declares \`-- PROGRAM: T-AV\` but is numbered ${n}; T-AV migrations use ` +
          `${AV_BLOCK_MIN}-${AV_BLOCK_MAX} until they are renumbered at the merge gate`,
      });
    }
    if (!inBlock) continue;

    checked.push(f);
    problems.push(...checkOne(f, src, verifierSql));
  }

  return { checked, problems };
}

export function formatProblems(problems: AvMigrationProblem[]): string {
  return problems.map((p) => `  ${p.file}  [${p.rule}]  ${p.detail}`).join('\n');
}
