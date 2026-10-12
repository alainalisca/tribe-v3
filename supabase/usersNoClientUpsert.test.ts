/**
 * T-AUTH3 guard: nothing upserts into `public.users`.
 *
 * WHY. `.from('users').upsert(payload, { onConflict: 'id' })` becomes
 * `INSERT ... ON CONFLICT (id) DO UPDATE SET col = EXCLUDED.col` for every key in
 * the payload, and reading `EXCLUDED.col` needs SELECT on `col`. `users` is under
 * column-level SELECT grants (066, 067, 113, 118), so an upsert naming any
 * revoked column (email first among them) fails 42501 as a whole and writes
 * nothing. That is exactly how every sign-in silently failed to save a Google
 * photo from migration 118 (July 2026) to T-AUTH3. Unit tests could not see it:
 * the DAL is mocked, and a mock upsert accepts any column.
 *
 * Write `users` with a plain `.insert()` (reads nothing) or an `.update()` of
 * columns the role may update. Neither reads a revoked column.
 *
 * HOW. This parses each file with the TypeScript compiler and looks for a call
 * `.upsert(...)` whose receiver chain contains `.from('users')`. It asks about the
 * call, not the text, so a comment or a string that mentions the pattern cannot
 * trip it, and a chain split across lines cannot hide from it.
 *
 * WHAT IT CANNOT SEE. A query builder stored in a variable first
 * (`const q = supabase.from('users'); q.upsert(...)`). Nothing in the repo does
 * that today; if you find yourself writing it, you are writing the bug.
 *
 * NO ALLOW-LIST, on purpose. A service-role caller could upsert safely (it holds
 * SELECT on every column), but none exists, and an exemption list here would
 * be the first place this bug came back.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['app', 'lib', 'components', 'hooks', 'contexts', 'supabase'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'out', 'android', 'ios']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** True when `node`'s receiver chain contains `.from('users')` (any quote style). */
function chainReadsUsers(node: ts.Expression): boolean {
  let cur: ts.Expression = node;
  for (;;) {
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'from' &&
        cur.arguments.length > 0 &&
        ts.isStringLiteralLike(cur.arguments[0]) &&
        cur.arguments[0].text === 'users'
      ) {
        return true;
      }
      cur = callee;
    } else if (ts.isPropertyAccessExpression(cur) || ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
    } else if (ts.isAwaitExpression(cur)) {
      cur = cur.expression;
    } else {
      return false;
    }
  }
}

/** Every `.from('users')...upsert(...)` call in `text`, as 1-based line numbers. */
export function usersUpsertLines(fileName: string, text: string): number[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'upsert' &&
      chainReadsUsers(node.expression.expression)
    ) {
      // The line of `.upsert`, not of the chain's start: that is where to look.
      lines.push(sf.getLineAndCharacterOfPosition(node.expression.name.getStart(sf)).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return lines;
}

describe('no code upserts into public.users (T-AUTH3)', () => {
  const files = SCAN_DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d)));

  it('read a real corpus, not an empty one', () => {
    // A guard over zero files passes forever. The repo has hundreds.
    expect(files.length).toBeGreaterThan(300);
    expect(files.some((f) => f.endsWith(path.join('lib', 'auth-helpers.ts')))).toBe(true);
  });

  it('finds no .from("users")...upsert() anywhere', () => {
    const offenders = files.flatMap((f) =>
      usersUpsertLines(f, fs.readFileSync(f, 'utf-8')).map((line) => `${path.relative(ROOT, f)}:${line}`)
    );
    expect(
      offenders,
      'An upsert on users reads EXCLUDED.<col> for every column it sends; any column without SELECT ' +
        '(email, and others under 066/067/113/118) makes the whole statement fail 42501. Use insert() or update().'
    ).toEqual([]);
  });

  // The reading step, proven: feed it the exact shape of the bug and its disguises.
  describe('the detector objects to known offenders', () => {
    it('the original T-AUTH3 line', () => {
      const src = "const { error } = await supabase.from('users').upsert(payload, { onConflict: 'id' });";
      expect(usersUpsertLines('x.ts', src)).toEqual([1]);
    });

    it('split across lines, double quotes, with a select() after', () => {
      const src = 'await supabase\n  .from("users")\n  .upsert({ id, email })\n  .select("id");';
      expect(usersUpsertLines('x.ts', src)).toEqual([3]);
    });

    it('but not another table, a comment, or a string', () => {
      const src = [
        "await supabase.from('user_private').upsert({ user_id });",
        "// supabase.from('users').upsert(payload)",
        'const s = "supabase.from(\'users\').upsert(payload)";',
        "await supabase.from('users').update({ name }).eq('id', id);",
      ].join('\n');
      expect(usersUpsertLines('x.ts', src)).toEqual([]);
    });
  });
});
