import type { PostHog } from 'posthog-js';
import type { Attribution } from './attribution';
import { ATTR_TAG_FIELDS } from './attribution';

let posthogInstance: PostHog | null = null;
let initPromise: Promise<PostHog> | null = null;

/**
 * Lazily loads and initializes PostHog.
 * The posthog-js SDK (~45KB) is dynamically imported so it doesn't
 * block the critical render path on initial page load.
 */
export async function initPostHog(): Promise<PostHog | null> {
  if (typeof window === 'undefined') return null;
  if (posthogInstance) return posthogInstance;

  if (!initPromise) {
    initPromise = import('posthog-js').then((mod) => {
      const ph = mod.default;
      ph.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        loaded: (posthog) => {
          if (process.env.NODE_ENV === 'development') posthog.debug();
        },
        capture_pageview: false, // We'll capture manually
        // LR-01 (revised): auto-capture browser exceptions into PostHog's
        // Activity → Exceptions view. Pairs with lib/captureError.ts on
        // the server side. No separate Sentry vendor required.
        capture_exceptions: true,
      });
      posthogInstance = ph;
      return ph;
    });
  }

  return initPromise;
}

/**
 * Returns the PostHog instance if already initialized, or null.
 * Use this for synchronous access (e.g., capturing events after init).
 * For guaranteed access, use initPostHog() instead.
 */
export function getPostHog(): PostHog | null {
  return posthogInstance;
}

/**
 * T-GROW1. Send captured attribution to PostHog as person properties.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY $set AND $set_once, WHICH IS THE WHOLE POINT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * setPersonProperties takes two objects: the first overwrites, the second only
 * writes a key that is not already there. That maps exactly onto the two things
 * lib/attribution.ts stores, and it means PostHog enforces the first-touch
 * guarantee on its side rather than this code having to read before writing:
 *
 *   last touch  -> $set,      overwritten on every tagged visit
 *   first touch -> $set_once, written once and never again
 *
 * The prefixes are `tribe_` because PostHog has its own `$initial_referrer` and
 * UTM handling, and two systems writing `utm_source` on one person would be
 * indistinguishable in a funnel. Tribe's values are the ones that came off a
 * printed QR or a WhatsApp link and survived a 90 day gap; PostHog's are the
 * ones from the current pageview.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS NOT SENT, AND IT IS THE PRIVACY LINE RATHER THAN AN OVERSIGHT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * No session key, no landing path, and nothing that identifies a person. The
 * T-GROW0 privacy gate found that the published Politica de tratamiento de datos
 * v1.0 does not name PostHog in its processors list at all, and does not cover
 * recording arrival against an ACCOUNT. Both are v1.1 items. So this sends the
 * campaign dimensions a measurement purpose already covers and nothing that
 * makes the profile richer than that.
 *
 * 2026-10-09: policy v1.1 names PostHog as a processor and covers recording
 * arrival on an account, so both reasons above are now satisfied. The payload
 * is deliberately NOT widened by that: v1.1 makes these properties permitted,
 * and nothing here needed more than it already sends.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE THING TO VERIFY IN THE DASHBOARD, STATED RATHER THAN ASSUMED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Whether these land for an ANONYMOUS visitor depends on this project's
 * `person_profiles` setting. Under `identified_only` -- the default in recent
 * posthog-js -- person properties set before an identify() call may be dropped,
 * so the values would appear for signed-in users and silently not for strangers,
 * which is the half of the audience a pass link is aimed at. initPostHog above
 * does not set the option, so the library default applies, and this session had
 * no dashboard access to read which default that is.
 *
 * It is written down here rather than guessed at because CLAUDE.md's rule is
 * explicit: a claim about a tool's behaviour is a measurement or it is a guess,
 * and a guess in confident prose is indistinguishable from a measurement six
 * weeks later. The Origen tab does NOT depend on this -- it reads
 * attribution_events and pass_leads, which are written server side -- so a
 * PostHog setting cannot cost any of the program's numbers. This is the
 * convenience copy.
 */
export function setAttributionPersonProperties(last: Attribution | null, first: Attribution | null): void {
  if (!last && !first) return;

  const props = (attr: Attribution | null, prefix: string): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!attr) return out;
    for (const field of ATTR_TAG_FIELDS) {
      const value = attr[field];
      if (value !== null) out[`${prefix}${field}`] = value;
    }
    return out;
  };

  const set = props(last, 'tribe_last_');
  const setOnce = props(first, 'tribe_first_');
  if (Object.keys(set).length === 0 && Object.keys(setOnce).length === 0) return;

  // initPostHog rather than getPostHog: this runs from a mount effect in the root
  // layout and PostHogProvider initializes in its own effect, so there is no
  // ordering guarantee between them. getPostHog() would return null on whichever
  // of the two happened to run first, and the properties would be dropped on
  // exactly the first page load -- the one carrying the campaign parameters.
  // initPostHog is idempotent and returns the same promise.
  void initPostHog()
    .then((ph) => {
      ph?.setPersonProperties(set, setOnce);
    })
    .catch(() => {
      // Analytics is never allowed to surface. A blocked tracker, an ad blocker
      // or a failed chunk load must not reach a visitor claiming a free class.
    });
}
