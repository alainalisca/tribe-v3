import { NextResponse } from 'next/server';
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';

type AdminGate =
  | { ok: true; service: SupabaseClient; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Auth gate for service-role admin API routes (T-SEC5 Batch 2).
 *
 * These routes read data with the service-role client, which BYPASSES RLS and
 * every column grant — so a missing or wrong gate turns each route into a full
 * unauthenticated data hole. This gate is the single line of defense and it
 * FAILS CLOSED on every non-happy path.
 *
 * Order matters:
 *   1. Resolve the caller from the SESSION (cookie) client. No session -> 403.
 *   2. Verify admin via is_app_admin() — the SAME DB check the admin pages gate
 *      on (fetchUserIsAdmin -> is_app_admin RPC). It runs on the session client
 *      so auth.uid() is the caller. RPC error, or anything other than the
 *      literal boolean true -> 403.
 *   3. ONLY after admin is confirmed do we construct the service-role client.
 *      It is never returned to a non-admin.
 *
 * Any thrown error, or missing service-role env, also returns 403 (never a 500
 * that could leak detail, and never a fall-through that reads data).
 */
export async function requireApiAdmin(): Promise<AdminGate> {
  const forbidden = (): { ok: false; response: NextResponse } => ({
    ok: false,
    response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
  });

  try {
    // 1. Who is calling? (session client, auth.uid() = caller)
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return forbidden();

    // 2. Is the caller a DB admin? Strict boolean-true check; fail closed on
    //    any error or non-true result.
    const { data: isAdmin, error: adminErr } = await supabase.rpc('is_app_admin');
    if (adminErr || isAdmin !== true) return forbidden();

    // 3. Only now: service-role client for the actual read.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      logError('requireApiAdmin: missing service-role env', { action: 'requireApiAdmin' });
      return forbidden();
    }
    const service = createServiceClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return { ok: true, service, userId: user.id };
  } catch (error) {
    logError(error, { action: 'requireApiAdmin' });
    return forbidden();
  }
}
