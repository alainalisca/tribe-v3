/**
 * Data-access layer for training_partners — the community graph.
 *
 * Every time two clients attend the same session a training_partners
 * row is upserted (see migration 076's trigger). Each edge tracks how
 * many times the pair has shown up together, plus when they last did,
 * giving us the social-graph "this client trains with these people"
 * view that powers retention follow-ups.
 *
 * Reads route through RLS — every gym coach can SELECT their gym's
 * edges. Writes are service-role only (trigger + nightly job).
 *
 * Note: the table stores each pair once with member_a_id < member_b_id
 * (DB CHECK constraint). To find partners for a given client we OR
 * across both sides and then project the "other" side into a uniform
 * shape so the UI doesn't have to care which slot the client landed
 * in.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface TrainingPartner {
  /** The other client in the pair (never the one we queried for). */
  partner_id: string;
  partner_name: string;
  partner_phone: string | null;
  /** Lifetime co-attendance count. */
  shared_sessions: number;
  /** Rolling 30-day co-attendance (maintained by nightly job; may be 0). */
  last_30_day_sessions: number;
  /** ISO timestamp of the most recent shared session. */
  last_shared_at: string;
}

interface PartnerRow {
  member_a_id: string;
  member_b_id: string;
  shared_sessions: number;
  last_30_day_sessions: number;
  last_shared_at: string;
  client_a: { id: string; name: string; phone: string | null } | null;
  client_b: { id: string; name: string; phone: string | null } | null;
}

/**
 * List the strongest training partners for a single client, ordered
 * by shared_sessions DESC. Caller can cap with `limit` — UI typically
 * wants the top 5.
 */
export async function listPartnersForMember(
  supabase: SupabaseClient,
  clientId: string,
  options: { limit?: number } = {}
): Promise<DalResult<TrainingPartner[]>> {
  const limit = options.limit ?? 5;

  try {
    // Embed both sides of the pair in one query. We don't know which
    // slot `clientId` will occupy (the DB stores pairs canonically
    // with member_a_id < member_b_id), so we ask for both joins and
    // pick the "other" side in JS.
    const { data, error } = await supabase
      .from('training_partners')
      .select(
        `
          member_a_id, member_b_id,
          shared_sessions, last_30_day_sessions, last_shared_at,
          client_a:clients!training_partners_member_a_id_fkey(id, name, phone),
          client_b:clients!training_partners_member_b_id_fkey(id, name, phone)
        `
      )
      .or(`member_a_id.eq.${clientId},member_b_id.eq.${clientId}`)
      .order('shared_sessions', { ascending: false })
      .limit(limit);

    if (error) {
      logError(error, { action: 'listPartnersForMember', clientId });
      return { success: false, error: error.message };
    }

    const rows = ((data ?? []) as unknown as PartnerRow[])
      .map<TrainingPartner | null>((row) => {
        // Pick the side that isn't the queried client. The embedded
        // join sometimes comes back as null (deleted client, RLS
        // hiding it) — skip those entries rather than rendering a
        // partner with no name.
        const isASide = row.member_a_id === clientId;
        const partner = isASide ? row.client_b : row.client_a;
        if (!partner) return null;
        return {
          partner_id: partner.id,
          partner_name: partner.name,
          partner_phone: partner.phone,
          shared_sessions: row.shared_sessions,
          last_30_day_sessions: row.last_30_day_sessions,
          last_shared_at: row.last_shared_at,
        };
      })
      .filter((p): p is TrainingPartner => p !== null);

    return { success: true, data: rows };
  } catch (error) {
    logError(error, { action: 'listPartnersForMember.exception', clientId });
    return { success: false, error: 'Failed to load training partners' };
  }
}
