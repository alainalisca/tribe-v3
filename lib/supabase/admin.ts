import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Returns a memoized service-role Supabase client that bypasses RLS.
 *
 * Use for:
 *  - Writes to `rate_limits` (deny-by-default RLS — auth/SSR clients hit 42501)
 *  - Public/unauthenticated endpoints that must insert (signup, guest forms)
 *  - Admin-only operations explicitly intended to bypass user-scoped policies
 *
 * NEVER import from a client component. Service role grants full DB access.
 */
export function getServiceRoleClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('getServiceRoleClient: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
