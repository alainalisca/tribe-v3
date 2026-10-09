'use client';

import { useEffect, useRef } from 'react';
import { initPostHog } from '@/lib/posthog';

/**
 * Starts the PostHog load once per page lifecycle.
 *
 * T-ANALYTICS1 part A: there is no pageview component here any more. posthog-js
 * captures $pageview itself (`capture_pageview: 'history_change'` in
 * lib/posthog.ts), including the landing one, which the old usePathname effect
 * lost whenever it ran before the SDK chunk had loaded. Capturing here as well
 * would count every route twice.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      // Load PostHog asynchronously — doesn't block initial render
      void initPostHog();
    }
  }, []);

  return <>{children}</>;
}
