/** DAL: tribe_os_waitlist table — public marketing form for Tribe OS launch. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

// Inline types — `tribe_os_waitlist` won't appear in database.types.ts until
// types are regenerated after migration 056 is applied.
export interface TribeOSWaitlistInsert {
  name: string;
  email: string;
  what_they_teach: string;
  sessions_per_week?: number | null;
  language?: 'en' | 'es';
}

export interface TribeOSWaitlistRow {
  id: string;
  name: string;
  email: string;
  what_they_teach: string;
  sessions_per_week: number | null;
  language: 'en' | 'es';
  created_at: string;
}

/**
 * Inserts a new waitlist signup. Caller must pre-validate inputs.
 * Returns { success: false, error: 'duplicate' } on unique-email violation
 * so the API layer can map it to a 409 with a friendly message.
 */
export async function insertTribeOSWaitlistEntry(
  supabase: SupabaseClient,
  data: TribeOSWaitlistInsert
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('tribe_os_waitlist').insert({
      name: data.name,
      email: data.email,
      what_they_teach: data.what_they_teach,
      sessions_per_week: data.sessions_per_week ?? null,
      language: data.language ?? 'en',
    });
    if (error) {
      // 23505 = unique_violation (Postgres). Surface a stable token so the
      // API can map it to 409 without parsing error.message strings.
      if (error.code === '23505') return { success: false, error: 'duplicate' };
      logError(error, { action: 'insertTribeOSWaitlistEntry' });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertTribeOSWaitlistEntry' });
    return { success: false, error: 'Failed to join waitlist' };
  }
}

/**
 * Fetches all waitlist entries, newest first. Admin-only — RLS enforces this.
 */
export async function fetchTribeOSWaitlist(supabase: SupabaseClient): Promise<DalResult<TribeOSWaitlistRow[]>> {
  try {
    const { data, error } = await supabase
      .from('tribe_os_waitlist')
      .select('id, name, email, what_they_teach, sessions_per_week, language, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      logError(error, { action: 'fetchTribeOSWaitlist' });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data ?? []) as TribeOSWaitlistRow[] };
  } catch (error) {
    logError(error, { action: 'fetchTribeOSWaitlist' });
    return { success: false, error: 'Failed to load waitlist' };
  }
}
