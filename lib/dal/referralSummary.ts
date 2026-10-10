/**
 * DAL: the rows behind the admin "Referidos" section (T-GROW2 C). SERVICE-ROLE ONLY.
 *
 * Called from /api/admin/data behind requireApiAdmin(). It reads contact fields
 * (email, whatsapp) because the self-referral guard compares them, and those
 * never leave the server: summarizeReferrals returns counts and a display name.
 *
 * Users have NO phone column (measured on production 2026-10-09), so a
 * user-owned code is guarded on email alone; a lead-owned code on whatsapp and
 * email.
 *
 * The window applies to the REFERRED rows (when the lead or signup happened),
 * the same meaning the Origen tab's range has. Code owners are looked up
 * whenever they were created.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import {
  summarizeReferrals,
  type CodeOwner,
  type ReferralRow,
  type ReferredLead,
  type ReferredPerson,
} from '@/lib/growth/referralSummary';

interface UserCodeRow {
  referral_code: string;
  users: { name: string | null; email: string | null } | null;
}

export async function fetchReferralSummary(
  supabase: SupabaseClient,
  since: string | null
): Promise<DalResult<ReferralRow[]>> {
  try {
    let leadsQ = supabase.from('pass_leads').select('attr_ref, email, whatsapp, attended_at').not('attr_ref', 'is', null);
    let signupsQ = supabase.from('users').select('signup_ref, email').not('signup_ref', 'is', null);
    if (since) {
      leadsQ = leadsQ.gte('created_at', since);
      signupsQ = signupsQ.gte('created_at', since);
    }
    const [leadsRes, signupsRes] = await Promise.all([leadsQ, signupsQ]);
    if (leadsRes.error || signupsRes.error) {
      const error = leadsRes.error ?? signupsRes.error;
      logError(error, { action: 'fetchReferralSummary.referred' });
      return { success: false, error: error?.message ?? 'referred read failed' };
    }

    const leads: ReferredLead[] = (leadsRes.data ?? []).map((r) => ({
      ref: r.attr_ref as string,
      email: r.email as string | null,
      phone: r.whatsapp as string | null,
      attended: r.attended_at !== null,
    }));
    const signups: ReferredPerson[] = (signupsRes.data ?? []).map((r) => ({
      ref: r.signup_ref as string,
      email: r.email as string | null,
      phone: null,
    }));

    const codes = [...new Set([...leads, ...signups].map((p) => p.ref.toUpperCase()))];
    if (codes.length === 0) return { success: true, data: [] };

    const [userOwners, leadOwners] = await Promise.all([
      supabase
        .from('referrals')
        .select('referral_code, users!referrals_referrer_id_fkey(name, email)')
        .in('referral_code', codes)
        .is('referred_id', null),
      supabase.from('pass_leads').select('lead_ref_code, name, email, whatsapp').in('lead_ref_code', codes),
    ]);
    if (userOwners.error || leadOwners.error) {
      const error = userOwners.error ?? leadOwners.error;
      logError(error, { action: 'fetchReferralSummary.owners' });
      return { success: false, error: error?.message ?? 'owner read failed' };
    }

    const owners: CodeOwner[] = [
      ...((userOwners.data ?? []) as unknown as UserCodeRow[]).map((r) => ({
        code: r.referral_code,
        kind: 'user' as const,
        label: r.users?.name ?? r.referral_code,
        email: r.users?.email ?? null,
        phone: null,
      })),
      ...(leadOwners.data ?? []).map((r) => ({
        code: r.lead_ref_code as string,
        kind: 'lead' as const,
        label: (r.name as string | null) ?? (r.lead_ref_code as string),
        email: r.email as string | null,
        phone: r.whatsapp as string | null,
      })),
    ];

    return { success: true, data: summarizeReferrals(owners, leads, signups) };
  } catch (error) {
    logError(error, { action: 'fetchReferralSummary' });
    return { success: false, error: 'Failed to load referrals' };
  }
}
