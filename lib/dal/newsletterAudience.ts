/**
 * DAL: the Tribe side of the newsletter contact sync.
 *
 * Builds the same audience as the SQL that produced the first newsletter's 80
 * recipients (2026-10-11):
 *
 *   public.users u JOIN auth.users au ON au.id = u.id
 *   LEFT JOIN notification_preferences np ON np.user_id = u.id
 *   WHERE u.deleted_at IS NULL AND u.banned IS NOT TRUE
 *     AND u.is_test_account IS NOT TRUE
 *     AND au.email IS NOT NULL AND au.email_confirmed_at IS NOT NULL
 *
 * with one difference that is the point of the sync: suppressed people are
 * RETURNED, flagged `suppressed`, rather than filtered out. The sync needs to
 * see them to push their opt-out to Resend.
 *
 * THE ADDRESS COMES FROM auth.users, not public.users.email. The auth address
 * is the one the person confirmed and the one Supabase mails password resets
 * to; public.users.email is a copy that can lag an email change.
 *
 * Callers MUST pass the service-role client: auth.admin needs it, and
 * public.users is under per-column SELECT grants (067, 113).
 *
 * A FAILED READ FAILS THE WHOLE FETCH. Returning a partial audience would make
 * the missing people look like deleted accounts, and the sync would remove
 * their contacts. The planner's removal brake is the second line of defence,
 * not the first.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { AppMember } from '@/lib/newsletter/contactSyncPlan';
import type { DalResult } from './types';

const PAGE = 1000;

interface UserRow {
  id: string;
  name: string | null;
  is_instructor: boolean | null;
}

interface PrefRow {
  user_id: string;
  email_unsubscribed_at: string | null;
}

/** First word of the display name, as the first newsletter's SQL used. */
export function firstNameOf(name: string | null): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}

async function confirmedAuthEmails(supabase: SupabaseClient): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`auth.admin.listUsers: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email && u.email_confirmed_at) byId.set(u.id, u.email);
    }
    if (users.length < PAGE) break;
  }
  return byId;
}

async function eligibleUsers(supabase: SupabaseClient): Promise<UserRow[]> {
  const out: UserRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, is_instructor')
      .is('deleted_at', null)
      .not('banned', 'is', true)
      .not('is_test_account', 'is', true)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`users: ${error.message}`);
    const page = (data ?? []) as UserRow[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

async function suppressedIds(supabase: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('user_id, email_unsubscribed_at')
      .not('email_unsubscribed_at', 'is', null)
      .order('user_id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`notification_preferences: ${error.message}`);
    const page = (data ?? []) as PrefRow[];
    for (const r of page) out.add(r.user_id);
    if (page.length < PAGE) break;
  }
  return out;
}

/**
 * Every account that may be on the newsletter list, each with its opt-out
 * state. Users without a confirmed auth address are omitted entirely, which
 * the planner reads as "not a Tribe user", so any contact for them is removed.
 */
export async function fetchNewsletterAudience(supabase: SupabaseClient): Promise<DalResult<AppMember[]>> {
  try {
    const [emails, users, suppressed] = await Promise.all([
      confirmedAuthEmails(supabase),
      eligibleUsers(supabase),
      suppressedIds(supabase),
    ]);
    const members: AppMember[] = [];
    for (const u of users) {
      const email = emails.get(u.id);
      if (!email) continue;
      members.push({
        userId: u.id,
        email,
        firstName: firstNameOf(u.name),
        role: u.is_instructor === true ? 'instructor' : 'athlete',
        suppressed: suppressed.has(u.id),
        eligible: true,
      });
    }
    return { success: true, data: members };
  } catch (error) {
    logError(error, { action: 'fetchNewsletterAudience' });
    return { success: false, error: 'Failed to read the newsletter audience' };
  }
}
