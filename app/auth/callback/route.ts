import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const type = requestUrl.searchParams.get('type');
  const origin = requestUrl.origin;

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Auth callback error:', error);
        return NextResponse.redirect(`${origin}/auth?error=callback_failed`);
      }

      // If this is a password recovery flow, redirect to reset password page
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/auth?mode=reset-password`);
      }

      // Ensure OAuth user has a complete profile in public.users
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
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

        // Upsert to handle both cases:
        // - Trigger already created the row: updates avatar_url from OAuth
        // - Trigger didn't fire: creates the row as a safety net
        const { error: upsertError } = await supabase.from('users').upsert({
          id: user.id,
          email: user.email!,
          name,
          avatar_url: avatarUrl,
        }, { onConflict: 'id' });

        if (upsertError) {
          console.error('Failed to upsert user profile:', upsertError);
        }

        // Detect new user: account created within the last 60 seconds
        const isNewUser = !existingProfile
          || (Date.now() - new Date(user.created_at).getTime()) < 60_000;

        if (isNewUser) {
          return NextResponse.redirect(`${origin}/profile`);
        }
      }
    } catch (error) {
      console.error('Auth callback exception:', error);
      return NextResponse.redirect(`${origin}/auth?error=callback_failed`);
    }
  }

  // Existing user — go home
  return NextResponse.redirect(`${origin}/`);
}
