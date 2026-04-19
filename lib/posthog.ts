import type { PostHog } from 'posthog-js';

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
          if (process.env.NODE_ENV === 'development') posthog.debug()
        },
        capture_pageview: false, // We'll capture manually
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
