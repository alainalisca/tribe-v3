/**
 * The only write the leads views can make: marking a lead contacted.
 *
 * THIS IS AN RPC AND IT CANNOT BE A TABLE UPDATE. Measured on production with
 * has_column_privilege: `authenticated` has SELECT on every column of
 * pass_leads and UPDATE on NONE of them. So the "Admins manage pass leads"
 * policy (FOR ALL, is_app_admin()) is unreachable for writes from a browser
 * client at any privilege -- an admin gets 42501 on a direct update, and so
 * does a partner. The admin panel's usual write pattern (DAL call on the
 * browser client, RLS decides) simply does not transfer to this table.
 *
 * set_pass_lead_contacted (migration 175) is SECURITY DEFINER and checks
 * is_app_admin() OR ownership of the lead's partner. ONE implementation serves
 * the admin tab and the partner tab, and the writable surface is one column BY
 * CONSTRUCTION rather than by an UPDATE policy anyone could later widen.
 *
 * Callable from the browser client by both audiences: EXECUTE is granted to
 * authenticated and the function resolves the caller from auth.uid().
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/**
 * Set or clear contacted_at on one lead.
 *
 * Returns the resulting timestamp (or null when cleared) rather than void, so
 * the caller renders what the DATABASE decided instead of what it optimistically
 * assumed. An optimistic toggle that silently diverged from the row is how a
 * lead gets worked twice.
 *
 * A caller who is neither an admin nor the lead's partner gets a failure here,
 * not a silent no-op: the function raises rather than updating zero rows, so
 * "you may not do this" and "it worked" are never the same answer.
 */
export async function setPassLeadContacted(
  supabase: SupabaseClient,
  leadId: string,
  contacted: boolean
): Promise<DalResult<string | null>> {
  try {
    const { data, error } = await supabase.rpc('set_pass_lead_contacted', {
      p_lead_id: leadId,
      p_contacted: contacted,
    });

    if (error) {
      logError(error, { action: 'setPassLeadContacted', passLeadId: leadId });
      return { success: false, error: error.message };
    }

    // RETURNS timestamptz, so PostgREST yields the ISO string or null.
    return { success: true, data: (data as string | null) ?? null };
  } catch (error) {
    logError(error, { action: 'setPassLeadContacted', passLeadId: leadId });
    return { success: false, error: 'Failed to update the lead' };
  }
}
