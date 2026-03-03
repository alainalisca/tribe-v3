/** Page: /auth/callback — OAuth callback handler for web-based sign-in */
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { upsertUserProfile } from '@/lib/auth-helpers';
import { logError } from '@/lib/logger';

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function handleCallback() {
    const code = searchParams.get('code');
    const type = searchParams.get('type');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const returnTo = searchParams.get('returnTo');

    // Handle error params from Supabase OAuth redirect
    if (errorParam && !code) {
      logError(errorDescription || errorParam, { action: 'authCallback', route: '/auth/callback' });
      const msg = encodeURIComponent(errorDescription || errorParam);
      window.location.href = `/auth?error=${msg}`;
      return;
    }

    if (!code) {
      // No code — just go home
      window.location.href = '/';
      return;
    }

    const supabase = createClient();

    // Step 1: Exchange code for session using the BROWSER client
    // This is critical — the browser client has direct access to the PKCE
    // code_verifier cookie that was set during signInWithOAuth
    try {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        logError(exchangeError, { action: 'exchangeCodeForSession', route: '/auth/callback' });
        setError(exchangeError.message);
        window.location.href = `/auth?error=${encodeURIComponent(exchangeError.message)}`;
        return;
      }
    } catch (err: unknown) {
      logError(err, { action: 'exchangeCodeForSession', route: '/auth/callback' });
      const message = err instanceof Error ? err.message : 'callback_failed';
      window.location.href = `/auth?error=${encodeURIComponent(message)}`;
      return;
    }

    // At this point the user IS authenticated — never redirect to /auth again

    // Password recovery flow
    if (type === 'recovery') {
      window.location.href = '/auth?mode=reset-password';
      return;
    }

    // Step 2: Get user info and upsert profile (non-fatal)
    try {
      const { data, error: getUserError } = await supabase.auth.getUser();
      if (getUserError) {
        logError(getUserError, { action: 'getUser', route: '/auth/callback' });
      }

      if (data?.user) {
        const { isNewUser } = await upsertUserProfile(data.user);
        if (isNewUser) {
          window.location.href = '/profile/edit';
          return;
        }
      }
    } catch (err) {
      logError(err, { action: 'getUser', route: '/auth/callback' });
    }

    // Existing user — go home
    window.location.href = returnTo ? decodeURIComponent(returnTo) : '/';
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
      <div className="text-center">
        {error ? (
          <div className="space-y-4">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            <p className="text-stone-500 dark:text-gray-400 text-sm">Redirecting... / Redirigiendo...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-8 h-8 border-3 border-tribe-green border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-stone-600 dark:text-gray-300 text-sm">Signing in... / Iniciando sesión...</p>
          </div>
        )}
      </div>
    </div>
  );
}
