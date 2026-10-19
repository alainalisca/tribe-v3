/**
 * Which form /auth opens on.
 *
 * An invite link (/auth/?ref=CODE) opens on SIGN-UP. The person was sent it
 * because they are not on Tribe yet, so "Welcome back!" and a sign-in form is
 * the wrong first screen for nearly all of them, at the one moment the referral
 * loop most needs them to keep going. An existing user who taps an invite is
 * one tap from "Already have an account? Sign in", and Apple/Google work in
 * either mode.
 *
 * So does ?signup=1 (T-MOM1's claim link, for the same reason).
 *
 * Everything else, including a plain /auth, still opens on sign-in. Any `mode`
 * param wins over `ref` and `signup`: those links (reset-password) were sent
 * for a reason.
 */
export function opensOnSignIn(params: Pick<URLSearchParams, 'get'>): boolean {
  if (params.get('mode')) return true;
  // T-MOM1: a Moments claim link ("Ver mis fotos") is sent to someone not on Tribe yet.
  if (params.get('signup') === '1') return false;
  return !params.get('ref')?.trim();
}
