import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';

/**
 * T-JOIN1b: who may open a test session (Sesión de prueba): its host and the
 * admins, nobody else. Read from the viewer's own session cookie on the
 * server, so /session/<id>/ answers a real 404 to everyone else before any
 * of the page is sent. Admin status through is_app_admin() (users.is_admin
 * is not client-readable, migration 113). Any failure answers no.
 */
export async function viewerCanSeeTestSession(hostId: string | null | undefined): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    if (hostId && user.id === hostId) return true;
    const { data, error } = await supabase.rpc('is_app_admin');
    return !error && data === true;
  } catch (error) {
    logError(error, { action: 'viewerCanSeeTestSession' });
    return false;
  }
}
