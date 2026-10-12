/**
 * T-ANALYTICS1 part B. Turns a Supabase user into the PostHog identity, and the
 * signup method for signup_completed.
 *
 * Kept out of lib/analytics.ts on purpose: that file is the provider-agnostic
 * event surface and imports nothing but PostHog. This one reads the database.
 *
 * T-GROW1 part C TODO: once signup attribution ships (it is on the unmerged
 * feature/privacy-v1.1-signup-attribution branch), add first/last-touch `src`,
 * `code` and `utm_campaign` to the identify person properties, in
 * lib/analytics.ts PERSON_PROPERTY_KEYS, so the allow-list stays the one place
 * that says what PostHog may hold.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { fetchAnalyticsIdentityFacts } from '@/lib/dal/analyticsIdentity';
import { identifyUser, roleFor, trackEvent, type AnalyticsPersonProperties, type AnalyticsRole } from '@/lib/analytics';

export type SignupMethod = 'google' | 'apple' | 'email';

/** app_metadata.provider, folded to the three methods Tribe offers. */
export function signupMethodOf(user: Pick<User, 'app_metadata'>): SignupMethod {
  const provider = user.app_metadata?.provider;
  return provider === 'google' || provider === 'apple' ? provider : 'email';
}

/** YYYY-MM-DD of an ISO timestamp, or null. The day is all the analysis needs. */
export function signupDateOf(createdAt: string | undefined | null): string | null {
  return createdAt && /^\d{4}-\d{2}-\d{2}/.test(createdAt) ? createdAt.slice(0, 10) : null;
}

function languageOf(value: string | null): 'en' | 'es' | null {
  return value === 'en' || value === 'es' ? value : null;
}

export async function personPropertiesFor(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'created_at'>
): Promise<AnalyticsPersonProperties | null> {
  const facts = await fetchAnalyticsIdentityFacts(supabase, user.id);
  if (!facts.success || !facts.data) return null;
  return {
    role: roleFor(facts.data),
    preferred_language: languageOf(facts.data.preferredLanguage),
    is_internal: facts.data.isAdmin,
    signup_date: signupDateOf(user.created_at),
  };
}

/**
 * Identify `user` in PostHog. `stillCurrent` is checked after the database
 * read and before identify: a sign-out that lands while the facts are in flight
 * (the unverified-email path signs straight back out) must not be followed by
 * an identify that re-attaches the account to this device.
 *
 * Resolves true when identify was issued.
 */
export async function identifyCurrentUser(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'created_at'>,
  stillCurrent: () => boolean = () => true
): Promise<boolean> {
  const props = await personPropertiesFor(supabase, user);
  if (!stillCurrent()) return false;
  identifyUser(user.id, props);
  return true;
}

/**
 * signup_completed counts accounts, so it must not fire for someone revisiting
 * /onboarding/role (a reload, the back button, a typed URL). New signups are
 * the only thing routed there, and they arrive minutes after the account was
 * created; a day is a generous bound that still rules out an old account.
 */
export const SIGNUP_COMPLETED_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * T-ANALYTICS1 part B. Called by /onboarding/role once the chosen role is SAVED.
 * Re-identifies with the chosen role, then fires signup_completed (method from
 * app_metadata.provider), in that order, so the event lands on the person whose
 * role it reports.
 *
 * The chosen role is used rather than the database's for one reason: a gym is
 * an is_instructor row PLUS a featured_partners row, and that second row does
 * not exist until /partners/apply is submitted, so the facts would still say
 * instructor at this moment. Later loads read the database as usual.
 */
export async function recordSignupCompleted(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'created_at' | 'app_metadata'>,
  chosenRole: Exclude<AnalyticsRole, 'admin'>,
  now: number = Date.now()
): Promise<void> {
  const props = await personPropertiesFor(supabase, user);
  identifyUser(user.id, props ? { ...props, role: props.role === 'admin' ? 'admin' : chosenRole } : null);

  const createdAt = user.created_at ? Date.parse(user.created_at) : NaN;
  if (!Number.isFinite(createdAt) || now - createdAt > SIGNUP_COMPLETED_WINDOW_MS) return;
  trackEvent('signup_completed', { method: signupMethodOf(user), role: chosenRole });
}
