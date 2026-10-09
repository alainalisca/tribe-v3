'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { sanitizeReturnTo } from '@/lib/pendingReturnTo';
import { logError } from '@/lib/logger';

/**
 * Routes an incoming universal link / App Link to the path it names.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE ENTITLEMENT AND THE MANIFEST ARE NOT ENOUGH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The AASA file and the intent filter only decide WHICH APP opens. They do not
 * carry the path into it. Without this listener a tap on
 * /onboarding/sports/ opens Tribe at whatever screen it was last on -- which
 * looks like the link "worked" while landing the athlete nowhere near the
 * thing the email asked them to do.
 *
 * Two entry points, because they cover different launches and missing either
 * one leaves a case silently broken:
 *
 *   App.getLaunchUrl()  - the app was NOT running. The URL is waiting at
 *                         startup and no event fires for it.
 *   'appUrlOpen'        - the app WAS running, backgrounded or foregrounded.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PATH IS VALIDATED WITH THE SAME ONE RULE AS EVERY OTHER REDIRECT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * An incoming URL is attacker-supplied: anything can send the app a link. The
 * origin is checked against the site, and the path goes through
 * sanitizeReturnTo -- the same function the auth flow and the sports step use.
 * A second copy of that rule is the one that would miss "/\evil.com".
 *
 * Capacitor is imported dynamically so the plugin never enters the web
 * bundle, and the whole thing no-ops off-native.
 */
export default function DeepLinkRouter() {
  const router = useRouter();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import('@capacitor/app');

        const go = (url: string | null | undefined) => {
          if (!url) return;
          let parsed: URL;
          try {
            parsed = new URL(url);
          } catch {
            return; // not a URL we can reason about; ignore rather than guess
          }
          // Only links to our own site. A universal link cannot arrive from
          // another origin, but getLaunchUrl also returns custom schemes.
          if (parsed.origin !== window.location.origin) return;
          const path = sanitizeReturnTo(parsed.pathname + parsed.search);
          // '/' is a valid destination but means "the app opened normally",
          // and pushing it would discard wherever the user already was.
          if (!path || path === '/') return;
          router.push(path);
        };

        const launch = await App.getLaunchUrl();
        if (!cancelled) go(launch?.url);

        const handle = await App.addListener('appUrlOpen', (event) => go(event.url));
        if (cancelled) {
          void handle.remove();
          return;
        }
        cleanup = () => void handle.remove();
      } catch (error) {
        // A missing plugin or a web build must never break the layout.
        logError(error, { action: 'DeepLinkRouter.init' });
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);

  return null;
}
