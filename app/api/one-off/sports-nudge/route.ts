import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { isValidCronAuth } from '@/lib/auth/cron';
import { logError, log } from '@/lib/logger';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';
import { claimOneOffSend, recordOneOffOutcome, releaseOneOffClaim, type OneOffChannel } from '@/lib/dal/oneOffSends';
import { isEmailSuppressed, unsubUrlFor, unsubHeaders } from '@/lib/dal/emailUnsubscribe';
import { bilingual, type BilingualCopy } from '@/lib/oneOff/sportsNudgeCopy';

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

  let body: {
    dryRun?: boolean;
    channels?: OneOffChannel[];
    /** TEST MODE: send to these accounts INSTEAD of the audience. */
    onlyUserIds?: string[];
    /** Campaign key override, so a test does not burn a real claim. */
    campaign?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    // No body is a dry run, which is the safe reading of "I did not say".
  }
  const dryRun = body.dryRun !== false;
  const channels: OneOffChannel[] = body.channels?.length ? body.channels : ['push', 'email'];

  // ═══════════════════════════════════════════════════════════════════════
  // TEST MODE. It bypasses the AUDIENCE, never the GATES.
  // ═══════════════════════════════════════════════════════════════════════
  //
  // A real send is only ever seen for the first time by the people receiving
  // it, and the dry run cannot show it: it returns before the HTML is built
  // and before Resend is called. So there has to be a way to send one real
  // message to one known account.
  //
  // It has to bypass the audience query, because the obvious candidate for a
  // test recipient -- the owner's own account -- fails that query on two
  // counts: it is an instructor, and it has sports. Narrowing the audience
  // query to his id selects nobody and sends nothing, silently.
  //
  // What it does NOT bypass: isEmailSuppressed, shouldSendNotification, the
  // unsubscribe-link requirement, and the send-once claim. A test that skips
  // the gates tests a code path nobody will ever run.
  //
  // Capped at 5. This is a route that can mail people, reachable with the
  // CRON_SECRET, and an unbounded id list turns it into a targeting tool.
  const testIds = Array.isArray(body.onlyUserIds) ? body.onlyUserIds.filter((s) => typeof s === 'string') : [];
  if (testIds.length > 5) {
    return NextResponse.json({ error: 'onlyUserIds is capped at 5' }, { status: 400 });
  }

  // A distinct campaign key keeps a test out of the real campaign's ledger.
  // Without it, testing against somebody who IS in the audience would claim
  // their row and the real run would skip them as already sent.
  const campaign = body.campaign ?? CAMPAIGN;
  if (!/^[a-z0-9_]{3,64}$/.test(campaign)) {
    return NextResponse.json({ error: 'campaign must match /^[a-z0-9_]{3,64}$/' }, { status: 400 });
  }

  try {
    const supabase = getServiceRoleClient();

    // The audience, with the same gates every other count of these athletes
    // has used: live, not banned, not a test account, not an instructor, no
    // sports. Replicating the gates rather than trusting a remembered number
    // is the rule this repo learned by quoting "4 of 15" for a page that shows
    // 11 rows.
    const base = supabase.from('users').select('id, name, email, fcm_token, preferred_language');
    const { data, error } = testIds.length
      ? await base.in('id', testIds)
      : await base
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

    // ONE PERSON'S FAILURE MUST NOT ABORT EVERYONE ELSE'S SEND.
    //
    // Found on the first real send: runPush threw `fetch failed` (a dead
    // SITE_URL), the exception propagated to the outer catch, and the whole
    // request 500'd. The email leg for that person never ran, and every
    // recipient after them would have been skipped -- on a 34-person run, one
    // network blip on person 3 silently drops persons 4 to 34 while leaving
    // their claims behind, so the retry then skips them as already sent.
    //
    // A thrown error is now recorded against that person and that channel, and
    // the loop continues. The outer catch stays for failures that are about
    // the run as a whole, such as the audience query.
    for (const person of recipients) {
      for (const ch of ['push', 'email'] as OneOffChannel[]) {
        if (!channels.includes(ch)) continue;
        try {
          note(
            person.id,
            ch,
            ch === 'push'
              ? await runPush(supabase, person, dryRun, campaign)
              : await runEmail(supabase, person, dryRun, campaign)
          );
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'unknown';
          logError(err, { route: '/api/one-off/sports-nudge', action: `run_${ch}`, userId: person.id });
          // Record against the claim this person already holds, so a stranded
          // 'claimed' row becomes a 'failed' row naming the reason.
          await recordOneOffOutcome(supabase, campaign, person.id, ch, 'failed', reason);
          note(person.id, ch, 'failed');
        }
      }
    }

    const tally = (ch: OneOffChannel) =>
      Object.values(results).reduce<Record<string, number>>((acc, r) => {
        const o = r[ch];
        if (o) acc[o] = (acc[o] ?? 0) + 1;
        return acc;
      }, {});

    log('info', 'sports nudge run', {
      action: 'oneOff.sportsNudge',
      dryRun,
      campaign,
      mode: testIds.length ? 'test' : 'audience',
      audience: recipients.length,
    });
    return NextResponse.json({
      dryRun,
      mode: testIds.length ? 'test' : 'audience',
      campaign,
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
  dryRun: boolean,
  campaign: string
): Promise<Outcome> {
  if (!person.fcm_token) return 'no_address';
  if (!(await shouldSendNotification(supabase, person.id, NOTIFICATION_TYPE, 'push'))) return 'suppressed';

  const claim = await claimOneOffSend(supabase, campaign, person.id, 'push');
  // DalResult is not a discriminated union, so .data must be checked as well
  // as .success. Treating a successful-but-empty result as "already claimed"
  // would silently skip a person on a read that actually broke -- the
  // swallowed-failure shape, where absence of an error becomes evidence.
  if (!claim.success || !claim.data) return 'failed';
  if (!claim.data.claimed) return 'skipped_already_sent';

  if (dryRun) {
    await releaseOneOffClaim(supabase, campaign, person.id, 'push');
    return 'dry_run';
  }

  // Bilingual regardless of preferred_language -- see lib/oneOff/sportsNudgeCopy.
  const copy = bilingual();
  // Through /api/notifications/send, not a direct FCM call: that route already
  // clears an fcm_token the moment FCM reports it invalid, which is how a
  // bounce becomes a measurable fact rather than a log line.
  const res = await fetch(`${SITE_URL}/api/notifications/send/`, {
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
  await recordOneOffOutcome(supabase, campaign, person.id, 'push', ok ? 'sent' : 'failed', detail ?? undefined);
  return ok ? 'sent' : 'failed';
}

async function runEmail(
  supabase: ReturnType<typeof getServiceRoleClient>,
  person: Recipient,
  dryRun: boolean,
  campaign: string
): Promise<Outcome> {
  if (!person.email) return 'no_address';
  if (await isEmailSuppressed(supabase, person.id)) return 'suppressed';

  const claim = await claimOneOffSend(supabase, campaign, person.id, 'email');
  if (!claim.success || !claim.data) return 'failed';
  const { claimed, unsubToken } = claim.data;
  if (!claimed) return 'skipped_already_sent';

  if (dryRun) {
    await releaseOneOffClaim(supabase, campaign, person.id, 'email');
    return 'dry_run';
  }

  const copy = bilingual();
  void unsubToken; // superseded by the per-user token; see migration 189

  // NO LINK MEANS NO SEND. A missing token is 189's backfill not having
  // reached this row, and a promotional email with no way out is the thing
  // this whole mechanism exists to end. Failing here costs one person one
  // email; sending anyway costs them the only exit they have.
  const unsub = await unsubUrlFor(supabase, person.id, SITE_URL);
  if (!unsub.success || !unsub.data) {
    await recordOneOffOutcome(supabase, campaign, person.id, 'email', 'failed', 'no unsubscribe token');
    return 'failed';
  }
  const unsubUrl = unsub.data;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await recordOneOffOutcome(supabase, campaign, person.id, 'email', 'failed', 'RESEND_API_KEY not configured');
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
    await recordOneOffOutcome(supabase, campaign, person.id, 'email', ok ? 'sent' : 'failed', error?.message);
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

function emailHtml(copy: BilingualCopy, unsubUrl: string): string {
  const cta = `${SITE_URL}/onboarding/sports/`;
  // tribe-dark on white for body copy. No green text: measured 2026-09-13,
  // the best green in the palette is 3.04:1 on white and fails AA at body size.
  // Green stays a fill with dark text on it, which is 12.6:1.
  //
  // Spanish above, English below, one rule between them. Not two columns: at
  // phone width a two-column layout collapses into whichever one the client
  // decides to stack first, and that decision is not ours to lose.
  const block = (c: { emailHeading: string; emailBody: string; emailCta: string }, lang: string) => `
    <div lang="${lang}">
      <h1 style="font-size:1.4rem;margin:0 0 1rem;color:#272D34">${c.emailHeading}</h1>
      <p style="font-size:1rem;line-height:1.6;margin:0 0 1.5rem;color:#272D34">${c.emailBody}</p>
      <p style="margin:0 0 0.5rem">
        <a href="${cta}" style="display:inline-block;background:#A8DA36;color:#272D34;font-weight:700;text-decoration:none;padding:0.85rem 1.5rem;border-radius:999px">${c.emailCta}</a>
      </p>
    </div>`;
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F0F1F3;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <div style="max-width:32rem;margin:0 auto;padding:2rem 1rem;color:#272D34">
    ${block(copy.es, 'es')}
    <hr style="border:0;border-top:1px solid #D7DAE0;margin:2rem 0" />
    ${block(copy.en, 'en')}
    <p style="font-size:0.95rem;line-height:1.6;margin:2rem 0 2rem;white-space:pre-line;color:#272D34">${copy.es.emailSignoff}</p>
    <p style="font-size:0.8rem;line-height:1.5;color:#5B6470;margin:0">
      <a href="${unsubUrl}" style="color:#5B6470">${copy.es.unsubscribe}</a>
    </p>
    <p style="font-size:0.8rem;line-height:1.5;color:#5B6470;margin:0.4rem 0 0">
      <a href="${unsubUrl}" style="color:#5B6470">${copy.en.unsubscribe}</a>
    </p>
  </div></body></html>`;
}
