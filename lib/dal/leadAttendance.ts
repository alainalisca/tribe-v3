/**
 * The "Asistió" toggle (T-GROW1 part E). The second of the two writes the leads
 * views may make, beside lib/dal/leadContact.ts.
 *
 * AN RPC, AND IT CANNOT BE A TABLE UPDATE, for exactly the reason leadContact.ts
 * records: measured on production with has_column_privilege, `authenticated`
 * holds SELECT on every column of pass_leads and UPDATE on NONE of them. So the
 * "Admins manage pass leads" policy (FOR ALL, is_app_admin()) is unreachable for
 * writes from any browser client -- an admin gets 42501 on a direct update and so
 * does a partner. The panel's usual pattern does not transfer to this table.
 *
 * set_pass_lead_attended (migration 212) is SECURITY DEFINER and writes exactly
 * attended_at, attended_marked_by and attended_method. Three columns rather than
 * one, which is the only way it differs from the Contactado toggle: marking
 * attendance without recording who marked it leaves a row nobody can explain
 * later, and clearing attended_at while leaving attended_marked_by set leaves a
 * row saying nobody came and somebody saw them.
 *
 * ONE FUNCTION, TWO AUDIENCES, as with Contactado: the admin Leads tab and the
 * partner Leads section both call this. The database decides who may -- the
 * partner owner, an ACTIVE coach, or an app admin -- through av_can_work_door,
 * which is the same rule the door's own scanner uses.
 *
 * WHY NOT av_confirm_pass_attendance, WHICH ALREADY EXISTS. That one is the
 * door's write: keyed on the pass code a guest shows on their phone, set-only,
 * and deliberately idempotent. Set-only is the blocker -- a switch that cannot go
 * back makes a mis-tap permanent and the attended count can only ever rise.
 * Migration 212's header has the rest.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/**
 * Set or clear attended_at on one lead.
 *
 * Returns the resulting timestamp, or null when cleared, rather than void, so
 * the caller renders what the DATABASE decided instead of what it optimistically
 * assumed. That matters more here than for Contactado: the function preserves an
 * existing attended_at rather than moving it, so a second tap returns the
 * ORIGINAL time, and a UI that rendered `new Date()` would show a time the row
 * does not hold.
 *
 * A caller who may not work this partner's door gets a failure, not a silent
 * no-op: the function raises rather than updating zero rows, so "you may not do
 * this" and "it worked" are never the same answer.
 */
export async function setPassLeadAttended(
  supabase: SupabaseClient,
  leadId: string,
  attended: boolean
): Promise<DalResult<string | null>> {
  try {
    const { data, error } = await supabase.rpc('set_pass_lead_attended', {
      p_lead_id: leadId,
      p_attended: attended,
    });

    if (error) {
      logError(error, { action: 'setPassLeadAttended', passLeadId: leadId });
      return { success: false, error: error.message };
    }

    // RETURNS timestamptz, so PostgREST yields the ISO string or null.
    return { success: true, data: (data as string | null) ?? null };
  } catch (error) {
    logError(error, { action: 'setPassLeadAttended', passLeadId: leadId });
    return { success: false, error: 'Failed to update the lead' };
  }
}
