'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { initPostHog } from '@/lib/posthog';
import { resetUserIfIdentified } from '@/lib/analytics';
import { recordNavigation } from '@/lib/navigationSource';
import { cookieNames, hasAuthCookieName } from '@/lib/site/authCookie';

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

  // Part D: remember each in-app route so session_viewed can say where the
  // person came from (lib/navigationSource.ts, whose reader does not depend on
  // whether this effect or the page's runs first).
  const pathname = usePathname();
  useEffect(() => {
    recordNavigation(pathname);
  }, [pathname]);

  useEffect(() => {
    // Load PostHog asynchronously — doesn't block initial render. Idempotent,
    // so StrictMode's second mount is harmless.
    void initPostHog();

    // T-SITE1 Part F: supabase-js and the identify path are loaded here, not
    // imported at the top, because this provider wraps every page, the
    // marketing site included. With no Supabase auth cookie (a first visit)
    // there is nobody to identify yet, so the listener waits for an idle moment
    // instead of competing with the first paint. Subscribing later loses
    // nothing: INITIAL_SESSION fires on subscribe with whatever session exists.
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const subscribe = async () => {
      const [{ createClient }, { identifyCurrentUser }] = await Promise.all([
        import('@/lib/supabase/client'),
        import('@/lib/analyticsIdentity'),
      ]);
      if (cancelled) return;
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
      unsubscribe = () => subscription.unsubscribe();
    };

    let idleHandle: number | null = null;
    if (hasAuthCookieName(cookieNames(document.cookie))) {
      void subscribe();
    } else if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(() => void subscribe(), { timeout: 4000 });
    } else {
      idleHandle = window.setTimeout(() => void subscribe(), 2000);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null) {
        if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle);
        window.clearTimeout(idleHandle);
      }
      unsubscribe?.();
    };
  }, []);

  return <>{children}</>;
}
