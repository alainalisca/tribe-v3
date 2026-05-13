/**
 * lib/email/notifyClientAdded.ts
 *
 * Bridge between "coach created a client row" and "send the
 * matching member a welcome email pointing at /my-coach".
 *
 * Decision tree:
 *   1. No email on the client row → skip
 *   2. Email matches a public.users row → send the welcome
 *   3. Email doesn't match any Tribe user → skip (v1)
 *
 * Step #3 is intentional for v1: emailing into the void with "sign
 * up at Tribe" copy borders on cold outreach. We could ship that
 * later with a different email template ("you've been added —
 * create your Tribe account to see your data") but it's a separate
 * value calculation.
 *
 * Failures swallowed + logged — the caller's create response must
 * not depend on email send success.
 *
 * Service-role only; uses the same pattern as the digest sender.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';
import { sendCoachAddedYouWelcome } from './coachAddedYouWelcome';

export interface NotifyParams {
  /** The newly-created client row. */
  client: {
    name: string;
    email: string | null;
  };
  /** The gym the client was added to. */
  gymId: string;
  /** The user who performed the create — used to pull a coach display name. */
  actorUserId: string;
}

function buildServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createServiceClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tribe-v3.vercel.app';
}

/**
 * Resolve which path to take. Returns the email + language + gym
 * name + coach name needed for the welcome send, or null when we
 * should skip.
 */
async function buildPayload(params: NotifyParams) {
  if (!params.client.email) return null;
  const normalized = params.client.email.trim().toLowerCase();
  if (!normalized) return null;

  const service = buildServiceClient();
  if (!service) return null;

  // Check if the email belongs to a Tribe user. We pull preferred_language
  // here so the welcome email lands in the recipient's own language even
  // if the coach is on the other locale.
  const { data: userRow, error: userErr } = await service
    .from('users')
    .select('id, preferred_language')
    .ilike('email', normalized)
    .maybeSingle();
  if (userErr) {
    logError(userErr, { action: 'notifyClientAdded.user_lookup' });
    return null;
  }
  if (!userRow) return null; // v1 skip path

  // Gym name + coach name for the email body.
  const [{ data: gymRow }, { data: coachRow }] = await Promise.all([
    service.from('gyms').select('name').eq('id', params.gymId).maybeSingle(),
    service.from('users').select('name').eq('id', params.actorUserId).maybeSingle(),
  ]);

  return {
    memberName: params.client.name,
    memberEmail: normalized,
    // Default to en when preferred_language is null/unset
    language: ((userRow.preferred_language as string) === 'es' ? 'es' : 'en') as 'en' | 'es',
    gymName: (gymRow?.name as string) ?? 'your gym',
    coachName: (coachRow?.name as string) ?? 'Your coach',
  };
}

/**
 * Fire-and-log the welcome email. Awaitable so the caller can choose
 * to block on it (e.g. during tests) but the default usage is to
 * await without surfacing errors — a slow Resend shouldn't ever
 * block the client-create response from going back to the coach.
 *
 * Returns a small status object for observability.
 */
export async function notifyClientAdded(
  params: NotifyParams
): Promise<{
  sent: boolean;
  skipped_reason?: 'no_email' | 'not_tribe_user' | 'resend_not_configured' | 'send_failed';
}> {
  if (!process.env.RESEND_API_KEY) {
    log('debug', 'notifyClientAdded.skipped', { action: 'notifyClientAdded', reason: 'resend_not_configured' });
    return { sent: false, skipped_reason: 'resend_not_configured' };
  }

  try {
    const payload = await buildPayload(params);
    if (!payload) {
      // payload null can mean either "no email" or "not a Tribe
      // user" — buildPayload doesn't distinguish for caller
      // simplicity. The detail lives in the debug log above.
      return { sent: false, skipped_reason: params.client.email ? 'not_tribe_user' : 'no_email' };
    }
    await sendCoachAddedYouWelcome(payload, siteUrl());
    log('info', 'notifyClientAdded.sent', {
      action: 'notifyClientAdded',
      gymId: params.gymId,
      to: payload.memberEmail,
      language: payload.language,
    });
    return { sent: true };
  } catch (error) {
    logError(error, { action: 'notifyClientAdded.exception', gymId: params.gymId });
    return { sent: false, skipped_reason: 'send_failed' };
  }
}
