import { createClient } from '@/lib/supabase/server';

// NOTE (QA-09, @al): the second address (@aplusfitnessllc.com) was added to
// cover the user's working email — originally the list only had @aplusfitness.co.
// If one of these is obsolete, remove it.
export const ADMIN_EMAILS = ['alainalisca@aplusfitness.co', 'alainalisca@aplusfitnessllc.com'];

export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return false;
  return ADMIN_EMAILS.includes(user.email);
}
