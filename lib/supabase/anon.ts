import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * A server-side Supabase client with the ANON key and no session.
 *
 * For server code that reads public data and must not depend on a request:
 * app/sitemap.ts is revalidated hourly rather than rendered per request, and
 * lib/supabase/server.ts reads cookies(), which would force it dynamic. Every
 * read through this client is bound by the same RLS and grants a signed-out
 * stranger gets, so nothing it returns can be more private than what a visitor
 * can already load. Prefer it over the service role whenever the data is public.
 */
export function getAnonClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('getAnonClient: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
