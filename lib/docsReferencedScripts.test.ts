/**
 * A DOCUMENTED PROCEDURE THAT NAMES A SCRIPT IS ONLY AS GOOD AS THE SCRIPT
 * EXISTING.
 *
 * Found 2026-09-21 recording migration 187. supabase/migrations_applied.json
 * told the next person to regenerate it with scripts/syncMigrationsApplied.ts.
 * That file had never been written. The instruction was false for the whole
 * life of the file, and no test could have noticed, because a broken pointer
 * looks exactly like a working one until someone types the command.
 *
 * So: every "scripts/x.ts" this repo names in prose must exist. The rule is
 * cheap, and the failure it catches is one nobody hits until the day they are
 * mid-task and following instructions.
 *
 * WHAT IT CANNOT SAY: that the script still does what the prose claims. That
 * needs the script's own test. This asserts the pointer resolves -- which is
 * the half that was wrong.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

/** Tracked text files, so node_modules and build output are out by construction. */
const TRACKED = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n')
  .filter(Boolean)
  .filter((f) => /\.(ts|tsx|js|mjs|cjs|json|md|sql|sh|ya?ml)$/.test(f));

/**
 * THIS FILE IS EXCLUDED BY PATH, WITH THE REASON.
 *
 * It is a guard that walks the tree its own apparatus lives in -- the same
 * shape as the accent guard finding 'unete' inside its own exemption list.
 * The mutation cases below name scripts that deliberately do not exist, and
 * counting them as findings would make the guard permanently red over its own
 * test data. Nothing else is exempt: an exemption list here would fill with
 * broken pointers nobody re-checked, which is the defect.
 */
const SELF = 'docsReferencedScripts.test.ts';

/** `scripts/<name>.<ext>` anywhere in the text. */
const REF = /\bscripts\/[A-Za-z0-9_.\-/]+\.(?:ts|tsx|js|mjs|cjs|sh|sql|py)\b/g;

function brokenPointers(): string[] {
  const broken: string[] = [];
  for (const file of TRACKED) {
    if (file.endsWith(SELF)) continue;
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue; // unreadable or binary; not this guard's question
    }
    for (const m of new Set(text.match(REF) ?? [])) {
      if (!existsSync(m)) broken.push(`${file} names ${m}, which does not exist`);
    }
  }
  return broken.sort();
}

describe('every script a file tells you to run exists', () => {
  /**
   * NON-VACUITY. An empty corpus, a regex that matches nothing, or a `git
   * ls-files` that failed all produce zero broken pointers -- the same answer
   * as a healthy repo. This arm is what makes the assertion below mean
   * something, and it is the arm 180's return-type guard did not have.
   */
  it('the scan reaches a real corpus and finds real references', () => {
    expect(TRACKED.length).toBeGreaterThan(200);
    const referenced = new Set<string>();
    for (const file of TRACKED) {
      if (file.endsWith(SELF)) continue;
      try {
        for (const m of readFileSync(file, 'utf8').match(REF) ?? []) referenced.add(m);
      } catch {
        /* see above */
      }
    }
    expect(referenced.size).toBeGreaterThan(3);
  });

  it('no file names a script that is not there', () => {
    expect(brokenPointers()).toEqual([]);
  });

  /**
   * THE GUARD IS FED A KNOWN BAD POINTER. A detector that reads nothing is
   * quiet about everything, and quiet is what a healthy repo also looks like.
   */
  it('the detector objects to a script that does not exist', () => {
    const invented = 'scripts/thisScriptDoesNotExist.ts';
    expect(existsSync(invented)).toBe(false);
    expect(invented).toMatch(REF);
  });

  it('and accepts one that does', () => {
    const real = 'scripts/syncMigrationsApplied.ts';
    expect(existsSync(real)).toBe(true);
    expect(real).toMatch(REF);
  });
});
