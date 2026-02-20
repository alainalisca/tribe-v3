import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const type = requestUrl.searchParams.get('type');
  const origin = requestUrl.origin;

  if (code) {
    // Step 1: Exchange code for session — this is the CRITICAL step
    let supabase;
    try {
      supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Auth callback: exchangeCodeForSession failed:', error);
        return NextResponse.redirect(`${origin}/auth?error=callback_failed`);
      }
    } catch (error) {
      console.error('Auth callback: exchange exception:', error);
      return NextResponse.redirect(`${origin}/auth?error=callback_failed`);
    }

    // At this point the user IS authenticated — never redirect to /auth again
    // All errors below are non-fatal: log them but always redirect to / or /profile

    // If this is a password recovery flow, redirect to reset password page
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/auth?mode=reset-password`);
    }

    // Step 2: Get user info (non-fatal if it fails)
    let user;
    try {
      const { data, error: getUserError } = await supabase.auth.getUser();
      if (getUserError) {
        console.error('Auth callback: getUser error (non-fatal):', getUserError);
      }
      user = data?.user;
    } catch (error) {
      console.error('Auth callback: getUser exception (non-fatal):', error);
    }

    if (user) {
      // Step 3: Check existing profile + upsert (non-fatal if it fails)
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
      } catch (error) {
        console.error('Auth callback: profile upsert exception (non-fatal):', error);
      }

      if (isNewUser) {
        return NextResponse.redirect(`${origin}/profile`);
      }
    }
  }

  // Existing user or fallback — go home
  return NextResponse.redirect(`${origin}/`);
}
