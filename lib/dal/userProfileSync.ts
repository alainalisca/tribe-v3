import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/**
 * T-AUTH3. The INSERT half of what used to be `upsertUser`.
 *
 * WHY THIS IS NOT AN UPSERT. PostgREST turns `.upsert(payload, { onConflict: 'id' })`
 * into `INSERT ... ON CONFLICT (id) DO UPDATE SET col = EXCLUDED.col` for every
 * column in the payload, and reading `EXCLUDED.col` needs SELECT on that column.
 * Migration 118 revoked SELECT on `users.email` from `authenticated`, so the
 * sign-in upsert failed with 42501 on every sign-in since, writing nothing: not
 * the name, not the Google photo. `supabase/usersNoClientUpsert.test.ts` keeps
 * a client upsert on `users` from coming back.
 *
 * A plain INSERT reads nothing (no RETURNING), so it may carry `email`, which the
 * NOT NULL column needs when `handle_new_user` did not create the row.
 */
export interface NewUserProfileRow {
  id: string;
  name: string;
  email?: string;
  avatar_url?: string;
}

/** `duplicate` means the row already exists (a race with handle_new_user): update it instead. */
export async function insertUserProfileRow(
  supabase: SupabaseClient,
  row: NewUserProfileRow
): Promise<DalResult<null> & { duplicate?: boolean }> {
  try {
    const { error } = await supabase.from('users').insert(row);
    if (error) {
      return { success: false, error: error.message, duplicate: error.code === '23505' };
    }
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'insertUserProfileRow', userId: row.id });
    return { success: false, error: 'Failed to insert user profile' };
  }
}
