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

      // Check if OAuth user has a profile in public.users
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: existingProfile } = await supabase
          .from('users')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();

        if (!existingProfile) {
          // Create profile for OAuth user (safety net if trigger didn't fire)
          const name = user.user_metadata?.full_name
            || user.user_metadata?.name
            || user.email?.split('@')[0]
            || 'User';

          const { error: insertError } = await supabase.from('users').insert({
            id: user.id,
            email: user.email,
            name,
            avatar_url: user.user_metadata?.avatar_url || null,
          });

          if (insertError) {
            console.error('Failed to create user profile:', insertError);
          }

          // New user — send to profile to complete setup
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
