/**
 * T-AV23. The two reads the anonymous Pase path makes for athlete
 * attribution. Service role only: athlete_programs and program_athletes grant
 * nothing to anon (202, 203), and /api/pase and the pass page already hold a
 * service-role client.
 *
 * Both THROW on a database error instead of returning null. A null here means
 * "no program" or "no such athlete", and a transport failure must not read as
 * either: the caller (lib/pase/athleteAttribution.ts) catches, logs once, and
 * saves the lead without attribution.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AthleteProgramStatus {
  isActive: boolean;
}

export interface AthleteReferral {
  programAthleteId: string;
  firstName: string;
}

export async function fetchAthleteProgramStatus(
  supabase: SupabaseClient,
  partnerId: string
): Promise<AthleteProgramStatus | null> {
  const { data, error } = await supabase
    .from('athlete_programs')
    .select('is_active')
    .eq('partner_id', partnerId)
    .maybeSingle();
  if (error) throw new Error(`athlete_programs read failed: ${error.message}`);
  if (!data) return null;
  return { isActive: data.is_active === true };
}

/**
 * The active athlete of THIS partner whose ref code this is, or null.
 *
 * All three filters are the rule, and each is load-bearing:
 *   partner_id  a code only resolves on its own gym's pass (spec rule 5.5);
 *               on any other slug it stays plain `code`, as today
 *   status      a paused or ended athlete's code attributes nothing
 *   ref_code    stored uppercase (CHECK ^[A-Z0-9-]{4,24}$), so the typed
 *               code is uppercased to match
 *
 * The embed names its foreign key because program_athletes references users
 * twice (user_id and added_by), which PostgREST refuses to guess between.
 */
export async function findActiveAthleteByRefCode(
  supabase: SupabaseClient,
  partnerId: string,
  code: string
): Promise<AthleteReferral | null> {
  const { data, error } = await supabase
    .from('program_athletes')
    .select('id, user:users!program_athletes_user_id_fkey(name)')
    .eq('partner_id', partnerId)
    .eq('status', 'active')
    .eq('ref_code', code.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(`program_athletes read failed: ${error.message}`);
  if (!data) return null;

  const user = (Array.isArray(data.user) ? data.user[0] : data.user) as { name?: string | null } | null;
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';
  // No first name, no attribution: the consent line has to say who invited
  // the guest, and it cannot say "" (lib/pase/athleteAttribution.ts).
  if (!firstName) return null;
  return { programAthleteId: String(data.id), firstName };
}
