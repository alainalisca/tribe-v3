import { createClient } from '@/lib/supabase/server';

const ADMIN_EMAILS = ['alainalisca@aplusfitness.co'];

export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return false;
  return ADMIN_EMAILS.includes(user.email);
}
