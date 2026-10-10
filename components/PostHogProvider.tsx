'use client';

import { useEffect, useRef } from 'react';
import { initPostHog } from '@/lib/posthog';
import { createClient } from '@/lib/supabase/client';
import { resetUserIfIdentified } from '@/lib/analytics';
import { identifyCurrentUser } from '@/lib/analyticsIdentity';

/** Auth events after which the signed-in user should be (re)identified. */
const IDENTIFY_EVENTS = new Set(['INITIAL_SESSION', 'SIGNED_IN', 'USER_UPDATED']);

/**
 * Starts the PostHog load and keeps PostHog's identity in step with Supabase's.
 *
 * T-ANALYTICS1 part A: there is no pageview component here any more. posthog-js
 * captures $pageview itself (`capture_pageview: 'history_change'` in
 * lib/posthog.ts), including the landing one, which the old usePathname effect
 * lost whenever it ran before the SDK chunk had loaded. Capturing here as well
 * would count every route twice.
 *
 * T-ANALYTICS1 part B: one onAuthStateChange listener for the whole app.
 * INITIAL_SESSION covers every authenticated load, SIGNED_IN covers a sign-in
 * that completes in this page (the OAuth callback), USER_UPDATED a changed
 * account. identify goes through withPostHog, so it is queued, not dropped,
 * when it lands before posthog-js has loaded. Identify used to live in the
 * home feed only, ran at most once per mount, and read a null instance on the
 * first load, which is why PostHog had no identified people at all.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  // Who Supabase says is signed in right now, updated synchronously from the
  // listener; and who PostHog was last told about.
  const currentUserId = useRef<string | null>(null);
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    // Load PostHog asynchronously — doesn't block initial render. Idempotent,
    // so StrictMode's second mount is harmless.
    void initPostHog();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      currentUserId.current = user?.id ?? null;

      if (event === 'SIGNED_OUT') {
        identifiedUserId.current = null;
        resetUserIfIdentified();
        return;
      }
      if (!user || !IDENTIFY_EVENTS.has(event)) return;
      // SIGNED_IN also fires on tab refocus; identify once per user unless the
      // account itself changed.
      if (identifiedUserId.current === user.id && event !== 'USER_UPDATED') return;

      // Deferred: supabase-js runs this callback while holding its auth lock,
      // and the identify path makes Supabase calls of its own.
      setTimeout(() => {
        void identifyCurrentUser(supabase, user, () => currentUserId.current === user.id).then((issued) => {
          if (issued) identifiedUserId.current = user.id;
        });
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, []);

  return <>{children}</>;
}
