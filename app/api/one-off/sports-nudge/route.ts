import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { isValidCronAuth } from '@/lib/auth/cron';
import { logError, log } from '@/lib/logger';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';
import { claimOneOffSend, recordOneOffOutcome, releaseOneOffClaim, type OneOffChannel } from '@/lib/dal/oneOffSends';
import { isEmailSuppressed, unsubUrlFor, unsubHeaders } from '@/lib/dal/emailUnsubscribe';
import { copyFor } from '@/lib/oneOff/sportsNudgeCopy';

/**
 * @description One-off nudge to athletes with no sports: push to those with a token, email to all of them.
 * @method POST
 * @auth Required — CRON_SECRET bearer. Not reachable with a user session.
 * @param {boolean} request.body.dryRun - DEFAULTS TO TRUE. Must be explicitly false to send.
 * @param {string} request.body.channels - Optional subset, e.g. ["push"].
 * @returns {{ audience, push, email, recipients }} Per-person outcomes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * dryRun DEFAULTS TO TRUE, AND THAT IS NOT CAUTION THEATRE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every other destructive control in this app is a flag that must be set to
 * stop something. This one must be set to START it. A route that mails 34 real
 * people should not do that because somebody curled it to see what it does.
 *
 * THE AUDIENCE IS 34, NOT 28, AND THE DIFFERENCE IS A LESSON.
 * 28 athletes have neither sports nor a photo; 34 have no sports (the 28 plus
 * 6 who have a photo but no sports). This route selects on SPORTS, because
 * sports is what find_training_partners ranks on and what /instructors filters
 * by -- a photo changes nothing about being findable. 28 was predicted for a
 * query that counts 34, measured on apply. Same shape as migration 179, where
 * a predicted 13 met an enforced 14 because the two counts carried different
 * filters. A number is only comparable to another number over the same
 * population, and the predicate is part of the number's definition.
 *
 * A dry run claims and then RELEASES each claim, so it cannot silently consume
 * the campaign. A dry run that left its claims behind would make the real run
 * skip everybody -- a rehearsal quietly becoming the whole campaign, which is
 * the rehearsal-scaffolding failure this repo has already recorded once.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT GATES WHAT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PUSH  -> shouldSendNotification(type, 'push'). The type's category is
 *          training_nudges, which DEFAULTS ON, so this reaches people who have
 *          not turned nudges off. Using the `general` type instead would have
 *          gated on `marketing`, which defaults false, and reached nobody.
 *
 * EMAIL -> isEmailSuppressed(), the hard opt-out added by migration 188, and
 *          NOT email_enabled.
 *
 *          email_enabled cannot answer "did this person ask us to stop". 037
 *          defaulted it false, 151 backfilled a preferences row for every user
 *          supplying only user_id, and updateNotificationPreferences rewrites
 *          the whole defaults object on any patch. Every false in that column
 *          is a default, a backfill, or a side effect of saving an unrelated
 *          toggle. Gating on it would send to approximately nobody while
 *          looking rigorous; treating it as consent would be inventing one.
 *
 *          Before 188 there was no unsubscribe route, no List-Unsubscribe
 *          header and no suppression table anywhere in this app, so nobody has
 *          ever been able to opt out of anything. That is why every email here
 *          carries a working unsubscribe link and the RFC 8058 headers: after
 *          this campaign, "has not opted out" becomes a statement with content.
 */
const CAMPAIGN = 'sports_nudge_2026_09';
const NOTIFICATION_TYPE = 'comeback'; // training_nudges category; push default_on
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tribe-v3.vercel.app';
// The verified Resend sender, identical to every other email this app sends.
// tribeapp.co is not a domain Resend holds for this account, so a plausible
// address on it would have had every one of these 34 emails rejected at the
// API with nothing on the recipient's side to show for it.
const FROM = 'Tribe <tribe@aplusfitnessllc.com>';

interface Recipient {
  id: string;
  name: string | null;
  email: string | null;
  fcm_token: string | null;
  preferred_language: string | null;
}

type Outcome = 'sent' | 'failed' | 'suppressed' | 'skipped_already_sent' | 'dry_run' | 'no_address';

export async function POST(request: Request) {
  if (!isValidCronAuth(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { dryRun?: boolean; channels?: OneOffChannel[] } = {};
  try {
    body = await request.json();
  } catch {
    // No body is a dry run, which is the safe reading of "I did not say".
  }
  const dryRun = body.dryRun !== false;
  const channels: OneOffChannel[] = body.channels?.length ? body.channels : ['push', 'email'];

  try {
    const supabase = getServiceRoleClient();

    // The audience, with the same gates every other count of these athletes
    // has used: live, not banned, not a test account, not an instructor, no
    // sports. Replicating the gates rather than trusting a remembered number
    // is the rule this repo learned by quoting "4 of 15" for a page that shows
    // 11 rows.
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, fcm_token, preferred_language')
      .is('deleted_at', null)
      .not('banned', 'is', true)
      .not('is_test_account', 'is', true)
      .not('is_instructor', 'is', true)
      .or('sports.is.null,sports.eq.{}');

    if (error) {
      logError(new Error(error.message), { route: '/api/one-off/sports-nudge', action: 'audience' });
      return NextResponse.json({ error: 'Failed to read the audience' }, { status: 500 });
    }

    const recipients = (data ?? []) as Recipient[];
    const results: Record<string, Partial<Record<OneOffChannel, Outcome>>> = {};
    const note = (id: string, ch: OneOffChannel, o: Outcome) => {
      results[id] = { ...(results[id] ?? {}), [ch]: o };
    };

    for (const person of recipients) {
      if (channels.includes('push')) {
        note(person.id, 'push', await runPush(supabase, person, dryRun));
      }
      if (channels.includes('email')) {
        note(person.id, 'email', await runEmail(supabase, person, dryRun));
      }
    }

    const tally = (ch: OneOffChannel) =>
      Object.values(results).reduce<Record<string, number>>((acc, r) => {
        const o = r[ch];
        if (o) acc[o] = (acc[o] ?? 0) + 1;
        return acc;
      }, {});

    log('info', 'sports nudge run', { action: 'oneOff.sportsNudge', dryRun, audience: recipients.length });
    return NextResponse.json({
      dryRun,
      campaign: CAMPAIGN,
      audience: recipients.length,
      audienceWithToken: recipients.filter((r) => r.fcm_token).length,
      audienceWithEmail: recipients.filter((r) => r.email).length,
      push: channels.includes('push') ? tally('push') : null,
      email: channels.includes('email') ? tally('email') : null,
      recipients: results,
    });
  } catch (error) {
    logError(error, { route: '/api/one-off/sports-nudge' });
    return NextResponse.json({ error: 'Send failed' }, { status: 500 });
  }
}

async function runPush(
  supabase: ReturnType<typeof getServiceRoleClient>,
  person: Recipient,
  dryRun: boolean
): Promise<Outcome> {
  if (!person.fcm_token) return 'no_address';
  if (!(await shouldSendNotification(supabase, person.id, NOTIFICATION_TYPE, 'push'))) return 'suppressed';

  const claim = await claimOneOffSend(supabase, CAMPAIGN, person.id, 'push');
  // DalResult is not a discriminated union, so .data must be checked as well
  // as .success. Treating a successful-but-empty result as "already claimed"
  // would silently skip a person on a read that actually broke -- the
  // swallowed-failure shape, where absence of an error becomes evidence.
  if (!claim.success || !claim.data) return 'failed';
  if (!claim.data.claimed) return 'skipped_already_sent';

  if (dryRun) {
    await releaseOneOffClaim(supabase, CAMPAIGN, person.id, 'push');
    return 'dry_run';
  }

  const copy = copyFor(person.preferred_language);
  // Through /api/notifications/send, not a direct FCM call: that route already
  // clears an fcm_token the moment FCM reports it invalid, which is how a
  // bounce becomes a measurable fact rather than a log line.
  const res = await fetch(`${SITE_URL}/api/notifications/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({
      userId: person.id,
      type: NOTIFICATION_TYPE,
      title: copy.pushTitle,
      body: copy.pushBody,
      url: '/onboarding/sports',
    }),
  });

  const ok = res.ok;
  const detail = ok ? null : `status ${res.status}`;
  await recordOneOffOutcome(supabase, CAMPAIGN, person.id, 'push', ok ? 'sent' : 'failed', detail ?? undefined);
  return ok ? 'sent' : 'failed';
}

async function runEmail(
  supabase: ReturnType<typeof getServiceRoleClient>,
  person: Recipient,
  dryRun: boolean
): Promise<Outcome> {
  if (!person.email) return 'no_address';
  if (await isEmailSuppressed(supabase, person.id)) return 'suppressed';

  const claim = await claimOneOffSend(supabase, CAMPAIGN, person.id, 'email');
  if (!claim.success || !claim.data) return 'failed';
  const { claimed, unsubToken } = claim.data;
  if (!claimed) return 'skipped_already_sent';

  if (dryRun) {
    await releaseOneOffClaim(supabase, CAMPAIGN, person.id, 'email');
    return 'dry_run';
  }

  const copy = copyFor(person.preferred_language);
  void unsubToken; // superseded by the per-user token; see migration 189

  // NO LINK MEANS NO SEND. A missing token is 189's backfill not having
  // reached this row, and a promotional email with no way out is the thing
  // this whole mechanism exists to end. Failing here costs one person one
  // email; sending anyway costs them the only exit they have.
  const unsub = await unsubUrlFor(supabase, person.id, SITE_URL);
  if (!unsub.success || !unsub.data) {
    await recordOneOffOutcome(supabase, CAMPAIGN, person.id, 'email', 'failed', 'no unsubscribe token');
    return 'failed';
  }
  const unsubUrl = unsub.data;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await recordOneOffOutcome(supabase, CAMPAIGN, person.id, 'email', 'failed', 'RESEND_API_KEY not configured');
    return 'failed';
  }

  try {
    const { error } = await new Resend(key).emails.send({
      from: FROM,
      to: person.email,
      subject: copy.emailSubject,
      html: emailHtml(copy, unsubUrl),
      headers: unsubHeaders(unsubUrl),
    });
    const ok = !error;
    await recordOneOffOutcome(supabase, CAMPAIGN, person.id, 'email', ok ? 'sent' : 'failed', error?.message);
    return ok ? 'sent' : 'failed';
  } catch (err) {
    await recordOneOffOutcome(
      supabase,
      CAMPAIGN,
      person.id,
      'email',
      'failed',
      err instanceof Error ? err.message : 'unknown'
    );
    return 'failed';
  }
}

function emailHtml(copy: ReturnType<typeof copyFor>, unsubUrl: string): string {
  const cta = `${SITE_URL}/onboarding/sports`;
  // tribe-dark on white for body copy. No green text: measured 2026-09-13,
  // the best green in the palette is 3.04:1 on white and fails AA at body size.
  // Green stays a fill with dark text on it, which is 12.6:1.
  return `<!doctype html><html><body style="margin:0;background:#F0F1F3;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:32rem;margin:0 auto;padding:2rem 1rem;color:#272D34">
    <h1 style="font-size:1.4rem;margin:0 0 1rem">${copy.emailHeading}</h1>
    <p style="font-size:1rem;line-height:1.6;margin:0 0 1.5rem">${copy.emailBody}</p>
    <p style="margin:0 0 2rem">
      <a href="${cta}" style="display:inline-block;background:#A8DA36;color:#272D34;font-weight:700;text-decoration:none;padding:0.85rem 1.5rem;border-radius:999px">${copy.emailCta}</a>
    </p>
    <p style="font-size:0.95rem;line-height:1.6;margin:0 0 2rem;white-space:pre-line">${copy.emailSignoff}</p>
    <p style="font-size:0.8rem;line-height:1.5;color:#5B6470;margin:0">
      <a href="${unsubUrl}" style="color:#5B6470">${copy.unsubscribe}</a>
    </p>
  </div></body></html>`;
}
