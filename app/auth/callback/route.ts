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
        // Redirect to auth page with error on failure
        return NextResponse.redirect(`${origin}/auth?error=callback_failed`);
      }

      // If this is a password recovery flow, redirect to reset password page
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/auth?mode=reset-password`);
      }
    } catch (error) {
      console.error('Auth callback exception:', error);
      return NextResponse.redirect(`${origin}/auth?error=callback_failed`);
    }
  }

  // Use origin for more reliable redirect on Safari
  return NextResponse.redirect(`${origin}/`);
}
