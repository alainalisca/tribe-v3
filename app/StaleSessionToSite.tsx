'use client';

import { useEffect, type ReactNode } from 'react';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { cookieNames } from '@/lib/site/authCookie';
import { logError } from '@/lib/logger';

const ATTEMPT_KEY = 'tribe_stale_session_attempt';
const ATTEMPT_WINDOW_MS = 60_000;

/** Attempts made in this tab in the last minute; older ones belong to an earlier expiry. */
function recentAttempts(): number {
  try {
    const raw = window.sessionStorage.getItem(ATTEMPT_KEY);
    const [count, at] = (raw ?? '').split(':').map(Number);
    return count && Date.now() - at < ATTEMPT_WINDOW_MS ? count : 0;
  } catch {
    return 0;
  }
}

function recordAttempt(count: number) {
  try {
    window.sessionStorage.setItem(ATTEMPT_KEY, `${count}:${Date.now()}`);
  } catch {
    // Private browsing: the attempt cap below still stops at /auth.
  }
}

/** Expire every Supabase auth cookie (sb-<ref>-auth-token and its .0/.1 chunks). */
function clearAuthCookies() {
  for (const name of cookieNames(document.cookie)) {
    if (/^sb-.+-auth-token(\.\d+)?$/.test(name)) document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

/**
 * T-SITE1. The feed's signed-out branch: show the marketing site's Inicio.
 *
 * `/` reaches app/page.tsx only with a Supabase auth cookie (middleware serves
 * everyone else Inicio), so a visitor here with no user holds an expired or
 * revoked session. Inicio is a prerendered server page this client page cannot
 * render, so the stale cookie is cleared and `/` is loaded again: middleware then
 * serves Inicio at the same URL.
 *
 * Never destructive on doubt. A network failure is not a signed-out user (the
 * cookie may be good), so offline it waits and retries when the browser is back
 * online. A user who turns out to be signed in gets the feed. A cookie that will
 * not clear stops at /auth after two tries instead of looping.
 */
export default function StaleSessionToSite({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (data.user) {
        window.location.reload();
        return;
      }
      if (error && isAuthRetryableFetchError(error)) {
        window.addEventListener('online', () => window.location.reload(), { once: true });
        return;
      }

      const attempts = recentAttempts();
      if (attempts >= 2) {
        window.location.replace('/auth/');
        return;
      }
      recordAttempt(attempts + 1);
      if (attempts === 0) await supabase.auth.signOut({ scope: 'local' });
      else clearAuthCookies();
      if (!cancelled) window.location.replace(`${window.location.pathname}${window.location.search}`);
    };

    run().catch((err: unknown) => logError(err, { action: 'home.staleSessionToSite' }));
    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
}
