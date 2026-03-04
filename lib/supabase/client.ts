import { createBrowserClient } from '@supabase/ssr';
import { createClient as createRawClient } from '@supabase/supabase-js';

export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

/** Create a Supabase client with extra headers (e.g. x-guest-token for RLS) */
export function createClientWithHeaders(headers: Record<string, string>) {
  return createRawClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers },
  });
}
