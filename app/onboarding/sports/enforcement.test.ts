import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { stripJsComments } from '../../../lib/stripJsComments';

/**
 * "Sports is required" must be enforced WHERE IT IS SAVED.
 *
 * A greyed-out Continue button is the same shape as checking an invite's
 * recipient in validate_invite_token and not in join_session: the UI declines
 * to offer the action while the write itself accepts it. Anyone calling the
 * DAL directly, or a later screen reusing updateUser, writes an empty array
 * and nothing objects.
 *
 * So these tests assert THREE things, and the third is the one that is easy to
 * lose later:
 *   1. the migration's function refuses an empty list
 *   2. the screen writes through that function, not through updateUser
 *   3. the DAL wrapper does NOT re-implement the rule -- a second copy is the
 *      one that gets bypassed when a third caller appears
 */
const MIGRATION = 'supabase/migrations/187_athlete_setup.sql';
const SCREEN = 'app/onboarding/sports/page.tsx';
const DAL = 'lib/dal/athleteSetup.ts';

const sql = () => readFileSync(MIGRATION, 'utf8');
const code = (f: string) => stripJsComments(readFileSync(f, 'utf8'));

describe('sports is enforced at the write, not by the button', () => {
  /** NON-VACUITY: unreadable files satisfy every assertion below. */
  it('all three files are readable', () => {
    expect(sql().length).toBeGreaterThan(1000);
    expect(code(SCREEN).length).toBeGreaterThan(500);
    expect(code(DAL).length).toBeGreaterThan(200);
  });

  it('the migration refuses an empty sports list', () => {
    expect(sql()).toContain('at least one sport is required');
    expect(sql()).toMatch(/array_length\(v_clean, 1\), 0\) = 0/);
  });

  it('the migration trims before judging emptiness, so {""} is not a choice', () => {
    expect(sql()).toContain('btrim');
  });

  it('the screen writes through the refusing function, not through updateUser', () => {
    expect(code(SCREEN)).toContain('completeAthleteSetup');
    expect(code(SCREEN)).not.toContain('updateUser');
  });

  it('the DAL calls the RPC and does not re-implement the rule', () => {
    const c = code(DAL);
    expect(c).toContain("rpc('complete_athlete_setup'");
    // No length/emptiness check of its own. A second copy of a rule is the one
    // that drifts, and the one a later caller skips.
    expect(c).not.toMatch(/sports\.length\s*===?\s*0/);
    expect(c).not.toMatch(/if\s*\(\s*!sports/);
  });

  /**
   * THE BASELINE GUARD IS IN THE HANDLER, NOT ONLY ON THE BUTTON.
   *
   * Asserted in SOURCE because it cannot be asserted from the DOM: React does
   * not fire onClick on a disabled button, so a behaviour test that clicks
   * while loading proves the button is disabled and says nothing about the
   * handler. Deleting the handler's guard leaves every behaviour test green.
   *
   * It matters because the save is an OVERWRITE. Any future caller that
   * invokes onContinue another way -- a keyboard submit, a form wrapper, an
   * effect -- would write a list built from an unloaded screen and silently
   * drop whatever the athlete already had.
   */
  it('the screen refuses to save before the existing sports have loaded', () => {
    const c = code(SCREEN);
    expect(c).toMatch(/if \(baseline !== 'ready'\) return;/);
    // And the button, which is the courtesy layer on top of it.
    expect(c).toContain("baseline !== 'ready'");
  });

  it('a failed read is not treated as an empty profile', () => {
    // `?? []` on a failed read would prefill empty and re-arm the overwrite.
    expect(code(SCREEN)).toMatch(/!current\.success \|\| !current\.data/);
  });

  /** onboarding_completed_at is the intro TOUR, backfilled for every pre-156
   *  account. Giving it a second meaning is what made an earlier query
   *  conclude 27 athletes finished a wizard that does not exist. */
  it('nothing in this step touches onboarding_completed_at', () => {
    expect(sql()).not.toMatch(/SET[\s\S]{0,80}onboarding_completed_at\s*=/);
    expect(code(SCREEN)).not.toContain('onboarding_completed_at');
    expect(code(DAL)).not.toContain('onboarding_completed_at');
  });

  it('the step records its own column instead', () => {
    expect(sql()).toContain('athlete_setup_completed_at');
  });
});
