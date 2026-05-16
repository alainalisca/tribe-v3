/**
 * lib/email/notifyClientAdded.ts
 *
 * Bridge between "coach created a client row" and the appropriate
 * outbound email.
 *
 * Decision tree:
 *   1. No email on the client row → skip
 *   2. Email matches a public.users row → send the WELCOME email
 *      (points at /my-coach where their data already shows up)
 *   3. Email doesn't match any Tribe user → send the INVITE email
 *      (points at /auth with instructions to sign up using the same
 *      email address so the data appears automatically)
 *
 * Why we now fire on the no-match path (changed from v1's silent
 * skip): the gym coach explicitly typed this email address while
 * adding someone to their roster. The recipient gave that email to
 * a business they're already doing business with. That's not cold
 * outreach — it's a warm intro the coach asked for implicitly by
 * adding them.
 *
 * Bulk CSV import still suppresses both emails — a coach migrating
 * 200 contacts shouldn't unleash 200 emails in one shot.
 *
 * Failures swallowed + logged — the caller's create response must
 * not depend on email send success.
 *
 * Service-role only; uses the same pattern as the digest sender.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';
import { sendCoachAddedYouWelcome } from './coachAddedYouWelcome';
import { sendSignUpInvite } from './signUpInvite';

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
 * Discriminated payload — either a welcome send (the recipient is
 * already a Tribe user) or a sign-up invite (they aren't). Carries
 * all the fields each sender needs so the dispatch site doesn't
 * have to re-query.
 */
type EmailDispatch =
  | {
      kind: 'welcome';
      memberName: string;
      memberEmail: string;
      language: 'en' | 'es';
      gymName: string;
      coachName: string;
    }
  | {
      kind: 'invite';
      memberName: string;
      memberEmail: string;
      language: 'en' | 'es';
      gymName: string;
      coachName: string;
    };

/**
 * Resolve which path to take. Returns the right discriminated
 * dispatch (or null when we should skip — no email or
 * service-role unavailable).
 */
async function buildPayload(params: NotifyParams): Promise<EmailDispatch | null> {
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

  // Gym name + coach name for the body. The coach row also carries
  // the language we use for invites (no recipient preference exists
  // yet for an invitee — falling back to the coach's locale matches
  // whatever language they're already communicating with the
  // recipient in offline).
  const [{ data: gymRow }, { data: coachRow }] = await Promise.all([
    service.from('gyms').select('name').eq('id', params.gymId).maybeSingle(),
    service.from('users').select('name, preferred_language').eq('id', params.actorUserId).maybeSingle(),
  ]);

  const gymName = (gymRow?.name as string) ?? 'your gym';
  const coachName = (coachRow?.name as string) ?? 'Your coach';

  if (userRow) {
    return {
      kind: 'welcome',
      memberName: params.client.name,
      memberEmail: normalized,
      // For the welcome path, prefer the RECIPIENT's locale.
      language: ((userRow.preferred_language as string) === 'es' ? 'es' : 'en') as 'en' | 'es',
      gymName,
      coachName,
    };
  }

  return {
    kind: 'invite',
    memberName: params.client.name,
    memberEmail: normalized,
    // For the invite path, fall back to the COACH's locale.
    language: ((coachRow?.preferred_language as string) === 'es' ? 'es' : 'en') as 'en' | 'es',
    gymName,
    coachName,
  };
}

/**
 * Fire-and-log the appropriate email. Awaitable so the caller can
 * choose to block on it (e.g. during tests) but the default usage
 * is to await without surfacing errors — a slow Resend shouldn't
 * ever block the client-create response from going back to the
 * coach.
 *
 * Returns a small status object for observability. `kind` is set
 * when a send actually happened so analytics can split adoption
 * between the welcome and invite paths.
 */
export async function notifyClientAdded(params: NotifyParams): Promise<{
  sent: boolean;
  kind?: 'welcome' | 'invite';
  skipped_reason?: 'no_email' | 'resend_not_configured' | 'send_failed' | 'lookup_failed';
}> {
  if (!process.env.RESEND_API_KEY) {
    log('debug', 'notifyClientAdded.skipped', { action: 'notifyClientAdded', reason: 'resend_not_configured' });
    return { sent: false, skipped_reason: 'resend_not_configured' };
  }

  try {
    const payload = await buildPayload(params);
    if (!payload) {
      // Either no email on the client row, or buildPayload bailed
      // early (service-role unavailable, user-lookup failed, etc.).
      // We distinguish only on the no-email signal because that's
      // the path the create endpoint can correct.
      return {
        sent: false,
        skipped_reason: params.client.email ? 'lookup_failed' : 'no_email',
      };
    }
    if (payload.kind === 'welcome') {
      await sendCoachAddedYouWelcome(payload, siteUrl());
    } else {
      await sendSignUpInvite(payload, siteUrl());
    }
    log('info', 'notifyClientAdded.sent', {
      action: 'notifyClientAdded',
      gymId: params.gymId,
      to: payload.memberEmail,
      language: payload.language,
      kind: payload.kind,
    });
    return { sent: true, kind: payload.kind };
  } catch (error) {
    logError(error, { action: 'notifyClientAdded.exception', gymId: params.gymId });
    return { sent: false, skipped_reason: 'send_failed' };
  }
}
