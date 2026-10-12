/**
 * T-GROW1 part C: which attribution, if any, belongs on a new account.
 *
 * Pure. No storage, no network, no clock of its own, so every rule below is a
 * unit test rather than a reading of the route. /api/attr/signup calls it with
 * the touches the browser sent and the account's created_at from the database.
 *
 * Covered by policy v1.1 (2026-10-09), section 3: "how you arrived at Tribe
 * (the link, campaign or referral code you used) and, if someone invited you,
 * who invited you." Before v1.1 this was the one purpose the policy did not
 * cover, which is why part C shipped after the rest of T-GROW1.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE THREE RULES, AND WHAT EACH ONE STOPS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. ONLY A YOUNG ACCOUNT. The browser sends its touches on every completed
 *    sign-in, not only the first, because the client's own "is this a new
 *    user" test is a 60 second heuristic: an email signup that types its OTP a
 *    minute later reads as an existing user, and hooking part C onto that test
 *    would silently lose exactly those signups. So the server decides, and it
 *    refuses any account older than SIGNUP_WINDOW_MS. Without this, the 117
 *    accounts that predate part C would be credited to whatever link they
 *    happen to click next.
 *
 * 2. ONLY TOUCHES FROM BEFORE THE ACCOUNT EXISTED. A touch is a claim about how
 *    a person ARRIVED. One captured after signup -- they signed up untagged,
 *    then tapped a tagged link the next morning -- is a later visit, and
 *    crediting the signup to it would make a channel look like it recruits
 *    people it only re-engaged. `ts` is the capture time the client stamped;
 *    created_at is the server's. CLOCK_SLACK_MS absorbs ordinary skew between
 *    the two and is the only tolerance here.
 *
 * 3. LAST TOUCH FILLS THE COLUMNS, FIRST TOUCH IS KEPT WHOLE. Same split as
 *    pass_leads (migration 211): the flat columns are the visit that brought
 *    them in, the jsonb is where they first came from. If the last touch is
 *    ineligible under rule 2 and the first is not, the first fills the columns,
 *    because it is the most recent touch that predates the account.
 *
 * Written once, enforced twice: the route's UPDATE only matches a row whose
 * signup_attributed_at IS NULL, and migration 214's trigger refuses a second
 * write even from the service role.
 */
import { isTagged, type Attribution } from '@/lib/attribution';

/** Rule 1. Long enough for an email OTP typed the next day; short enough that no pre-part-C account qualifies. */
export const SIGNUP_WINDOW_MS = 7 * 86_400_000;

/** Rule 2. Phone clocks drift by seconds, not minutes; ten minutes is generous. */
export const CLOCK_SLACK_MS = 10 * 60_000;

/** What the route writes. Column names are migration 214's. */
export interface SignupAttributionFields {
  signup_src: string | null;
  signup_code: string | null;
  signup_ref: string | null;
  signup_utm_source: string | null;
  signup_utm_medium: string | null;
  signup_utm_campaign: string | null;
  signup_utm_content: string | null;
  signup_landing_path: string | null;
  signup_first_touch: Attribution | null;
}

export type SignupAttributionDecision =
  | { kind: 'write'; fields: SignupAttributionFields }
  /** Account outside rule 1. Not an error: an existing user signing in. */
  | { kind: 'too_old' }
  /** Nothing tagged that predates the account. Not an error: most signups. */
  | { kind: 'none' };

function predatesAccount(touch: Attribution | null, createdAtMs: number): touch is Attribution {
  return touch !== null && isTagged(touch) && touch.ts <= createdAtMs + CLOCK_SLACK_MS;
}

/**
 * Decide. `first` and `last` must already have been through
 * sanitizeAttributionObject: this function trusts their shape and judges only
 * their timing.
 */
export function decideSignupAttribution(
  first: Attribution | null,
  last: Attribution | null,
  createdAtMs: number,
  nowMs: number
): SignupAttributionDecision {
  if (!Number.isFinite(createdAtMs) || nowMs - createdAtMs > SIGNUP_WINDOW_MS) return { kind: 'too_old' };

  const eligibleFirst = predatesAccount(first, createdAtMs) ? first : null;
  const eligibleLast = predatesAccount(last, createdAtMs) ? last : null;
  const flat = eligibleLast ?? eligibleFirst;
  if (!flat) return { kind: 'none' };

  return {
    kind: 'write',
    fields: {
      signup_src: flat.src,
      signup_code: flat.code,
      signup_ref: flat.ref,
      signup_utm_source: flat.utm_source,
      signup_utm_medium: flat.utm_medium,
      signup_utm_campaign: flat.utm_campaign,
      signup_utm_content: flat.utm_content,
      signup_landing_path: flat.landing_path,
      signup_first_touch: eligibleFirst,
    },
  };
}
