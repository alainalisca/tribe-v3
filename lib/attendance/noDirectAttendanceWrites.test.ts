/**
 * T-AV2: av_mark_attendance is the only writer of session_attendance. The
 * database enforces it (migration 8000 revokes INSERT and UPDATE from client
 * roles); this keeps the code from growing a direct writer that would only
 * fail at runtime with 42501, which no mocked test would see.
 *
 * Reads the CALL CHAIN after each .from('session_attendance'), up to the end
 * of the statement, rather than matching a function name: the writer this
 * replaced was called upsertAttendance and a new one could be called anything.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['app', 'components', 'lib', 'hooks'];
const isTest = (f: string) => /\.test\.(ts|tsx)$/.test(f); // tests mock writes; they cannot perform one

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** Every .from('session_attendance') chain in `src` that ends in a write. */
export function directWrites(src: string): string[] {
  const found: string[] = [];
  const re = /\.from\(\s*['"`]session_attendance['"`]\s*\)/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const rest = src.slice(m.index, m.index + 600);
    const end = rest.search(/;|\n\s*\n/);
    const chain = end === -1 ? rest : rest.slice(0, end);
    const w = chain.match(/\.(insert|update|upsert|delete)\s*\(/);
    if (w) found.push(w[1]);
  }
  return found;
}

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)))
  .map((f) => path.relative(ROOT, f))
  .filter((f) => !isTest(f));

describe('no client code writes session_attendance directly', () => {
  it('reads a real corpus, including the files that read the table', () => {
    expect(files.length).toBeGreaterThan(200);
    const readers = files.filter((f) =>
      /from\(\s*['"`]session_attendance/.test(readFileSync(path.join(ROOT, f), 'utf8'))
    );
    expect(readers).toEqual(expect.arrayContaining(['components/StreakBanner.tsx', 'lib/dal/attendanceMarks.ts']));
  });

  it('the detector sees each write shape, across lines (known-answer cases)', () => {
    expect(directWrites(`supabase\n  .from('session_attendance')\n  .update({ attended })\n  .eq('id', x);`)).toEqual([
      'update',
    ]);
    expect(directWrites(`supabase.from("session_attendance").insert(data);`)).toEqual(['insert']);
    expect(directWrites(`s.from('session_attendance').upsert(r, { onConflict: 'session_id,user_id' });`)).toEqual([
      'upsert',
    ]);
    expect(directWrites(`s.from('session_attendance').select('user_id').eq('a', 1);`)).toEqual([]);
  });

  it('finds none in app, components, lib or hooks', () => {
    const offenders = files.flatMap((f) =>
      directWrites(readFileSync(path.join(ROOT, f), 'utf8')).map((w) => `${f}: .${w}()`)
    );
    expect(offenders).toEqual([]);
  });
});
