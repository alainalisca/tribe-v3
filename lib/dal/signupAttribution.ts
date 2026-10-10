/**
 * DAL: signup attribution on public.users (T-GROW1 part C). SERVICE-ROLE ONLY.
 *
 * WHY SERVICE ROLE. Migration 214's trigger refuses any change to a signup_*
 * column while auth.uid() is set, which is every call from a signed-in user's
 * client, admins included. authenticated holds a TABLE-LEVEL UPDATE on users
 * (measured on production 2026-10-09), so a column grant could not have done
 * this; the trigger is the only control, and it lets exactly one writer through:
 * a server route holding the service role, where auth.uid() is NULL.
 *
 * Not a SECURITY DEFINER function, on purpose. Inside a definer function called
 * by a user, auth.uid() is still that user, so the trigger would refuse it, and
 * exempting it would mean asking the trigger who called it -- the question
 * CLAUDE.md records as unanswerable across the SQL editor and PostgREST.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { SignupAttributionFields } from '@/lib/signupAttribution';

/** The account's creation time, epoch ms, or null if there is no such row. */
export async function fetchUserCreatedAt(supabase: SupabaseClient, userId: string): Promise<DalResult<number | null>> {
  try {
    const { data, error } = await supabase.from('users').select('created_at').eq('id', userId).maybeSingle();
    if (error) {
      logError(error, { action: 'fetchUserCreatedAt', userId });
      return { success: false, error: error.message };
    }
    if (!data?.created_at) return { success: true, data: null };
    return { success: true, data: new Date(data.created_at as string).getTime() };
  } catch (error) {
    logError(error, { action: 'fetchUserCreatedAt', userId });
    return { success: false, error: 'Failed to read account' };
  }
}

/** `recorded`: this call wrote. `already`: the row was written before, or is outside the window. */
export type SignupAttributionOutcome = 'recorded' | 'already';

/**
 * Write the signup attribution ONCE.
 *
 * The once-ness is in the WHERE clause, not in a read-then-write: two sign-in
 * completions racing each other (a double-mounted callback does happen) cannot
 * both match `signup_attributed_at IS NULL`, so the second updates zero rows and
 * reports `already`. `createdAfterIso` re-states the route's age rule in the same
 * statement, so the row cannot have aged out between the read and this write.
 *
 * signup_attributed_at is stamped here by the server, never taken from the body.
 */
export async function recordSignupAttribution(
  supabase: SupabaseClient,
  userId: string,
  fields: SignupAttributionFields,
  createdAfterIso: string
): Promise<DalResult<SignupAttributionOutcome>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ ...fields, signup_attributed_at: new Date().toISOString() })
      .eq('id', userId)
      .is('signup_attributed_at', null)
      .gte('created_at', createdAfterIso)
      .select('id');

    if (error) {
      logError(error, { action: 'recordSignupAttribution', userId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data && data.length > 0 ? 'recorded' : 'already' };
  } catch (error) {
    logError(error, { action: 'recordSignupAttribution', userId });
    return { success: false, error: 'Failed to record signup attribution' };
  }
}
