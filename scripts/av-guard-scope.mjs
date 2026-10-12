/**
 * av-guard, rule 1 in a db or dev context, for a branch outside the program.
 *
 * Al's instruction, written, 2026-10-12, after the guard blocked T-PAY2
 * (feat/t-pay2-payment-links, no athlete file touched) from the local stack:
 *
 *   "allow branches that touch no athlete files to run db:*, av:seed and
 *    dev:av, only when the database is local and PUSH_MODE and EMAIL_MODE
 *    are log."
 *
 * Kept apart from av-guard.mjs so the decision is a pure function a test can
 * call with every combination, instead of something only reachable by
 * checking out a branch with the right name and the right diff.
 *
 * ONLY rule 1 (the branch name) is ever skipped here. Rule 3 (a db/seed
 * script must point at the local stack) and rule 4 (PUSH_MODE and EMAIL_MODE
 * are `log`, as text and as resolved by lib/notify/sendMode.ts) are still
 * enforced by av-guard.mjs on this path, and they are ALSO preconditions of
 * the skip, so a branch that fails either of them gets the branch rule as well.
 * `main` is never relaxed; av-guard.mjs refuses it before this is consulted.
 */

/**
 * @param {object} input
 * @param {'db'|'dev'|'test'|'other'} input.context
 * @param {string[]|null} input.athleteTouched  null = scope could not be computed
 * @param {'local'|'prod-readonly'|'unset'} input.db
 * @param {{ push: string|undefined, email: string|undefined }} input.modeText  PUSH_MODE / EMAIL_MODE as written
 * @param {{ push: string, email: string }} input.modeResolved  what lib/notify/sendMode.ts resolves
 * @returns {{ relaxed: boolean, reason: string|null }}
 *   reason says why the branch rule still applies, or null when it is not
 *   this function's business (any context other than db or dev).
 */
export function branchRuleRelaxation({ context, athleteTouched, db, modeText, modeResolved }) {
  if (context !== 'db' && context !== 'dev') return { relaxed: false, reason: null };

  // Fail CLOSED, the same as the test-context relaxation: unknown scope is in scope.
  if (athleteTouched === null) {
    return {
      relaxed: false,
      reason:
        'scope: could not be computed (no merge base with origin/main, or git failed), ' +
        'so the branch rule applies. This is deliberate -- the guard fails CLOSED.',
    };
  }
  if (athleteTouched.length > 0) {
    return {
      relaxed: false,
      reason:
        `scope: this branch changes ${athleteTouched.length} athlete-program file(s), ` +
        `so the branch rule applies: ${athleteTouched.join(', ')}`,
    };
  }

  const unmet = [];
  if (db !== 'local') unmet.push(`the database is ${db}, not local`);
  if (modeText.push !== 'log' || modeResolved.push !== 'log') unmet.push('PUSH_MODE is not log');
  if (modeText.email !== 'log' || modeResolved.email !== 'log') unmet.push('EMAIL_MODE is not log');
  if (unmet.length > 0) {
    return {
      relaxed: false,
      reason:
        `scope: this branch touches no athlete file, but the branch rule still applies ` +
        `because ${unmet.join(' and ')}.`,
    };
  }

  return { relaxed: true, reason: null };
}
