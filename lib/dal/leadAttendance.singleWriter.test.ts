/**
 * pass_leads ATTENDANCE HAS EXACTLY TWO WRITERS, AND THEY ARE BOTH NAMED HERE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY TWO, WHEN THE REST OF THIS TABLE HAS ONE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * contacted_at has one writer and lib/dal/leadContact.singleWriter.test.ts pins
 * it to one file. attended_at has two by design, and the distinction is worth
 * enforcing rather than trusting:
 *
 *   lib/dal/passDoor.ts       av_confirm_pass_attendance -- the DOOR. Keyed on
 *                             the pass code a guest shows, set-only, idempotent.
 *   lib/dal/leadAttendance.ts set_pass_lead_attended -- the LEADS LISTS. Keyed on
 *                             the lead id, and it can CLEAR, so a mis-tap is
 *                             reversible.
 *
 * Two RPCs is a deliberate split (migration 212's header argues it: set-only is
 * right at a door and wrong for a toggle). Two CALL SITES per RPC would not be --
 * that is how the admin tab and the partner section drift until one of them
 * starts writing a column the other does not.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ASKED AS A CAPABILITY, NOT AS A NAME
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Comments are stripped first, because leadAttendance.ts's own header explains at
 * length why it is not av_confirm_pass_attendance and names it four times. A
 * check matching prose would flag its own explanation -- the failure CLAUDE.md
 * records five times in this repo, most recently a guard that learned about a
 * column named "so" from a migration comment.
 *
 * The second test is the one that actually protects the write surface: it asks
 * whether any client-side module UPDATES pass_leads directly, which is the thing
 * the definer functions exist to be the only route for.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { sourceWithoutComments } from '@/lib/testing/sourceWithoutComments';

const ROOT = path.resolve(__dirname, '..', '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const p = path.join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const TOGGLE_CALL = /\.rpc\(\s*['"`]set_pass_lead_attended['"`]/;
const DOOR_CALL = /\.rpc\(\s*['"`]av_confirm_pass_attendance['"`]/;

function callersOf(re: RegExp): string[] {
  return ['app', 'lib', 'components', 'hooks']
    .flatMap((d) => sources(path.join(ROOT, d)))
    .filter((f) => re.test(sourceWithoutComments(f)))
    .map((f) => path.relative(ROOT, f))
    .sort();
}

describe('pass_leads attendance has exactly two writers', () => {
  /** NON-VACUITY: if the source walk came back empty, both tests below are true
   *  of nothing. The repo is well over a thousand files. */
  it('reads the source tree', () => {
    const all = ['app', 'lib', 'components', 'hooks'].flatMap((d) => sources(path.join(ROOT, d)));
    expect(all.length).toBeGreaterThan(100);
  });

  it('only leadAttendance.ts calls set_pass_lead_attended', () => {
    expect(callersOf(TOGGLE_CALL)).toEqual(['lib/dal/leadAttendance.ts']);
  });

  it('only passDoor.ts calls av_confirm_pass_attendance', () => {
    // Asserted here rather than left to T-AV's own tests, because the two RPCs
    // write the same three columns and this file is where that fact is written
    // down. A new caller of either one is a second place attendance can be set.
    expect(callersOf(DOOR_CALL)).toEqual(['lib/dal/passDoor.ts']);
  });

  it('no module UPDATES pass_leads directly', () => {
    // The capability question, and the one that matters: migrations 175, 201, 204,
    // 211 and 212 all rest on `authenticated` holding no UPDATE on this table, so
    // a direct .update() would be a 42501 at runtime rather than a silent widening
    // -- but it would be a 42501 somebody then "fixes" with a GRANT.
    const offenders = ['app', 'lib', 'components', 'hooks']
      .flatMap((d) => sources(path.join(ROOT, d)))
      .filter((f) => {
        const src = sourceWithoutComments(f);
        // from('pass_leads') ... .update( within the same statement-ish window.
        return /from\(\s*['"`]pass_leads['"`]\s*\)[\s\S]{0,200}?\.update\(/.test(src);
      })
      .map((f) => path.relative(ROOT, f))
      .sort();

    expect(
      offenders,
      'pass_leads is written only through its definer functions. `authenticated` ' +
        'holds UPDATE on no column of it, so a direct update is a 42501 -- and the ' +
        "tempting fix for that 42501 is a GRANT, which is what migration 175's " +
        'guard exists to refuse. markPassLeadNotified is the one service-role ' +
        'exception and lives in lib/dal/passLeads.ts.'
    ).toEqual(['lib/dal/passLeads.ts']);
  });
});
