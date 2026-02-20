'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    const code = searchParams.get('code');
    const type = searchParams.get('type');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle error params from Supabase OAuth redirect
    if (errorParam && !code) {
      console.error('Auth callback: OAuth error from provider:', errorParam, errorDescription);
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
        console.error('Auth callback: exchangeCodeForSession failed:', exchangeError);
        setError(exchangeError.message);
        window.location.href = `/auth?error=${encodeURIComponent(exchangeError.message)}`;
        return;
      }
    } catch (err: any) {
      console.error('Auth callback: exchange exception:', err);
      window.location.href = `/auth?error=${encodeURIComponent(err.message || 'callback_failed')}`;
      return;
    }

    // At this point the user IS authenticated — never redirect to /auth again

    // Password recovery flow
    if (type === 'recovery') {
      window.location.href = '/auth?mode=reset-password';
      return;
    }

    // Step 2: Get user info (non-fatal)
    let user;
    try {
      const { data, error: getUserError } = await supabase.auth.getUser();
      if (getUserError) {
        console.error('Auth callback: getUser error (non-fatal):', getUserError);
      }
      user = data?.user;
    } catch (err) {
      console.error('Auth callback: getUser exception (non-fatal):', err);
    }

    if (user) {
      // Step 3: Profile upsert (non-fatal)
      let isNewUser = false;
      try {
        const { data: existingProfile } = await supabase
          .from('users')
          .select('id, avatar_url, created_at')
          .eq('id', user.id)
          .maybeSingle();

        const avatarUrl = user.user_metadata?.avatar_url || null;
        const name = user.user_metadata?.full_name
          || user.user_metadata?.name
          || user.email?.split('@')[0]
          || 'User';

        // Build upsert payload — handle Apple's potential null email
        const upsertPayload: Record<string, any> = {
          id: user.id,
          name,
          avatar_url: avatarUrl,
        };
        if (user.email) {
          upsertPayload.email = user.email;
        }

        const { error: upsertError } = await supabase
          .from('users')
          .upsert(upsertPayload, { onConflict: 'id' });

        if (upsertError) {
          console.error('Auth callback: upsert error (non-fatal):', upsertError);
        }

        // Detect new user: no existing profile or account created within last 60s
        isNewUser = !existingProfile
          || (Date.now() - new Date(user.created_at).getTime()) < 60_000;
      } catch (err) {
        console.error('Auth callback: profile upsert exception (non-fatal):', err);
      }

      if (isNewUser) {
        window.location.href = '/profile';
        return;
      }
    }

    // Existing user — go home
    window.location.href = '/';
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
      <div className="text-center">
        {error ? (
          <div className="space-y-4">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            <p className="text-stone-500 dark:text-gray-400 text-sm">Redirecting...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-8 h-8 border-3 border-tribe-green border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-stone-600 dark:text-gray-300 text-sm">Signing in...</p>
          </div>
        )}
      </div>
    </div>
  );
}
