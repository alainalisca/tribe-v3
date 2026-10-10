import type { PostHog } from 'posthog-js';
import type { Attribution } from './attribution';
import { ATTR_TAG_FIELDS } from './attribution';

let posthogInstance: PostHog | null = null;
let initPromise: Promise<PostHog | null> | null = null;

/**
 * T-ANALYTICS1. Calls made before posthog-js has loaded, replayed in order once
 * it has.
 *
 * The SDK is a dynamic import, so for the first few hundred milliseconds of
 * every page load there is no instance. Every helper used to read
 * getPostHog(), get null, and return -- so whatever fired in that window was
 * dropped without a trace. That window is exactly where the landing pageview,
 * an identify() for a returning user and the first event on a share link all
 * live. The cap is a backstop for a page where the SDK never loads (an ad
 * blocker on the chunk, a failed deploy): the queue must not grow forever.
 */
type PostHogCall = (ph: PostHog) => void;
const MAX_PENDING_CALLS = 200;
const pendingCalls: PostHogCall[] = [];

function runCall(ph: PostHog, call: PostHogCall): void {
  try {
    call(ph);
  } catch {
    // Analytics is never allowed to surface. Deliberately not logError():
    // logger forwards errors to analytics, which would loop back here.
  }
}

export type AnalyticsPlatform = 'ios' | 'android' | 'web';

/** Capacitor.getPlatform() folded to the three values PostHog sees. */
export function platformOf(capacitorPlatform: string | undefined | null): AnalyticsPlatform {
  return capacitorPlatform === 'ios' || capacitorPlatform === 'android' ? capacitorPlatform : 'web';
}

/**
 * The web build this page came from: the short commit SHA, injected at build
 * time by next.config.ts from VERCEL_GIT_COMMIT_SHA. The native apps load the
 * remote site (capacitor.config server.url), so this is also what an iOS or
 * Android user is running; the store version only changes the shell.
 */
export function appVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION || 'unknown';
}

/**
 * T-ANALYTICS1 part C. Super properties, attached to every event. Registered
 * inside `loaded`, which posthog-js calls synchronously inside init() BEFORE it
 * schedules the landing $pageview (setTimeout after loaded, verified in the
 * installed 1.434.14 source), so the first pageview carries them too.
 */
export function superPropertiesFor(capacitorPlatform: string | undefined | null) {
  return { platform: platformOf(capacitorPlatform), app_version: appVersion() };
}

async function capacitorPlatform(): Promise<string | null> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.getPlatform();
  } catch {
    // No Capacitor bridge: a plain browser. 'web' is the right answer.
    return null;
  }
}

/**
 * Lazily loads and initializes PostHog.
 * The posthog-js SDK (~45KB) is dynamically imported so it doesn't
 * block the critical render path on initial page load.
 */
export async function initPostHog(): Promise<PostHog | null> {
  if (typeof window === 'undefined') return null;
  if (posthogInstance) return posthogInstance;

  if (!initPromise) {
    initPromise = Promise.all([import('posthog-js'), capacitorPlatform()])
      .then(([mod, platform]) => {
        const ph = mod.default;
        ph.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
          loaded: (posthog) => {
            posthog.register(superPropertiesFor(platform));
            if (process.env.NODE_ENV === 'development') posthog.debug();
          },
          // T-ANALYTICS1 part A. The SDK captures the initial pageview and one
          // per pathname change (it patches pushState/replaceState, which is
          // how the App Router navigates). This replaced a usePathname effect in
          // PostHogProvider that dropped the landing pageview to the init race.
          //
          // Set explicitly rather than through `defaults: '<date>'`: every
          // defaults date after 2025-05-24 also changes session replay
          // behaviour (streamNetworkBody, captureJsonLd, the minimum duration
          // gate), and replay configuration is out of scope for this ticket.
          capture_pageview: 'history_change',
          // Rides on capture_pageview: the SDK sends $pageleave on unload only
          // when capture_pageview is truthy. With it off, as it was, PostHog
          // never received one. Spelled out so the dependency is visible.
          capture_pageleave: 'if_capture_pageview',
          // The library default, pinned: anonymous visitors stay eventless on
          // the person side and only identify() creates a profile.
          person_profiles: 'identified_only',
          // LR-01 (revised): auto-capture browser exceptions into PostHog's
          // Activity → Exceptions view. Pairs with lib/captureError.ts on
          // the server side. No separate Sentry vendor required.
          capture_exceptions: true,
        });
        posthogInstance = ph;
        for (const call of pendingCalls.splice(0)) runCall(ph, call);
        return ph;
      })
      .catch(() => {
        // The chunk failed to load. Nothing queued can ever be sent, so drop it,
        // and clear the promise so a later call can try again.
        pendingCalls.length = 0;
        initPromise = null;
        return null;
      });
  }

  return initPromise;
}

/**
 * Returns the PostHog instance if already initialized, or null.
 * Use this for synchronous access (e.g., capturing events after init).
 * For anything that must not be lost to the init race, use withPostHog().
 */
export function getPostHog(): PostHog | null {
  return posthogInstance;
}

/**
 * Run `call` against PostHog now if it is loaded, otherwise once it is.
 * Starts the load if nothing has yet. A no-op on the server.
 */
export function withPostHog(call: PostHogCall): void {
  if (typeof window === 'undefined') return;
  if (posthogInstance) {
    runCall(posthogInstance, call);
    return;
  }
  if (pendingCalls.length < MAX_PENDING_CALLS) pendingCalls.push(call);
  void initPostHog();
}

/** Test-only: forget the loaded instance and anything queued. */
export function __resetPostHogForTests(): void {
  posthogInstance = null;
  initPromise = null;
  pendingCalls.length = 0;
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
