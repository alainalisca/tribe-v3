import { createClient } from '@/lib/supabase/server';
import { ADMIN_EMAILS } from '@/lib/admin-config';

// Re-export so existing `import { ADMIN_EMAILS } from '@/lib/admin'` call
// sites keep working, but note: for client-callable DAL code import from
// '@/lib/admin-config' directly — this file pulls in next/headers via
// the Supabase server client.
export { ADMIN_EMAILS };

export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return false;
  return ADMIN_EMAILS.includes(user.email);
}
