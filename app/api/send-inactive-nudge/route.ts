import { getServiceRoleClient } from '@/lib/supabase/admin';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import {
  fetchUsersForReengagementEmail,
  fetchParticipationsWithSession,
  fetchSessionsByCreator,
  updateUser,
} from '@/lib/dal';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';
import { bogotaDateOffset } from '@/lib/time/bogotaDate';
import { isValidCronAuth } from '@/lib/auth/cron';

function getResendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tribe-v3.vercel.app';

/**
 * @description Sends re-engagement emails to users who have been inactive for 14+ days, encouraging them to return and browse sessions.
 * @method POST
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header.
 * @param {void} request.body - No request body expected; users are selected automatically based on inactivity criteria.
 * @returns {{ success: boolean, emailsSent: number, errors: number, totalUsers: number }} Summary of emails sent and any failures.
 */
export async function POST(request: Request) {
  try {
    const resend = getResendClient();
    // T1-3: fail CLOSED via the shared helper. The old direct compare to
    // `Bearer ${CRON_SECRET}` accepted the literal "Bearer undefined" when
    // CRON_SECRET was unset — anyone could trigger a mass email blast.
    if (!isValidCronAuth(request.headers.get('authorization'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Backend batch job: service-role. The anon/authenticated roles cannot read
    // the `users` columns this job needs (migrations 067 + 113), and its
    // per-user activity queries below should not be RLS-scoped to a session.
    const supabase = getServiceRoleClient();

    // Bounded, deduped audience (dedup + cap live in the DAL query):
    //   - last_reengagement_sent NULL or older than 30 days, so a recently
    //     re-engaged user is skipped. That column is SHARED with the engagement
    //     cron's push comeback on purpose, for cross-channel dedup: a user who
    //     just got a push comeback is not also emailed in the same window, and
    //     whichever cron runs first claims the window.
    //   - created more than 14 days ago (established accounts).
    //   - ordered NULLS FIRST and capped at 150 per run, so the backlog drains
    //     over several runs instead of a single mass blast.
    const now = new Date();
    const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgoIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const usersResult = await fetchUsersForReengagementEmail(supabase, {
      reengagementBefore: thirtyDaysAgoIso,
      createdBefore: fourteenDaysAgoIso,
      limit: 150,
    });
    // A failed query must NOT look like "nobody to email" — that is how this
    // job went silently dead under the 067 revoke. Surface it.
    if (!usersResult.success) {
      logError(usersResult.error, { action: 'sendInactiveNudge.fetchUsers' });
      return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
    }

    const users = usersResult.data ?? [];

    // Genuinely zero eligible recipients is a success, not an error.
    if (users.length === 0) {
      return NextResponse.json({ success: true, emailsSent: 0, errors: 0, totalUsers: 0 });
    }

    // Compared to session.date (Bogota-local), so it must use the Bogota
    // calendar date. (T0-9)
    const twoWeeksAgoStr = bogotaDateOffset(-14);

    let emailsSent = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Check if user has any recent activity
        const recentParticipationResult = await fetchParticipationsWithSession(supabase, user.id, {
          userJoinFields: 'id',
          dateGte: twoWeeksAgoStr,
        });
        const recentParticipation = recentParticipationResult.data || [];

        const recentHostedResult = await fetchSessionsByCreator(supabase, user.id, {
          dateGte: twoWeeksAgoStr,
          fields: 'id',
        });
        const recentHosted = recentHostedResult.data || [];

        // Skip users with recent activity
        if (recentParticipation.length || recentHosted.length) continue;

        // Gate on the user's email preference for this type. comeback is opt_in
        // on email under the delivery-policy model, so this sends to almost
        // nobody until users opt into email. That is correct and expected, not a
        // bug: email_enabled is a consent record and defaults off.
        const allowed = await shouldSendNotification(supabase, user.id, 'comeback', 'email');
        if (!allowed) continue;

        const lang = user.preferred_language || 'en';
        const isSpanish = lang === 'es';

        const subject = isSpanish ? `👋 Te extrañamos en Tribe` : `👋 We miss you on Tribe`;

        const greeting = isSpanish ? `Hola ${user.name},` : `Hi ${user.name},`;

        const message = isSpanish
          ? `Notamos que no has entrenado con nosotros últimamente. Tu comunidad de entrenamiento te está esperando.`
          : `We noticed you haven't trained with us lately. Your training community is waiting for you.`;

        const stats = isSpanish
          ? `Hay sesiones nuevas todos los días en tu área.`
          : `There are new sessions happening every day in your area.`;

        const cta = isSpanish ? `¡Vuelve y nunca entrenes solo!` : `Come back and never train alone!`;

        const buttonText = isSpanish ? 'Ver Sesiones' : 'Browse Sessions';
        const tagline = isSpanish ? 'Nunca Entrenes Solo' : 'Never Train Alone';

        await resend.emails.send({
          from: 'Tribe <tribe@aplusfitnessllc.com>',
          to: user.email,
          subject: subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
              <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h1 style="font-size: 28px; margin: 0;">Tribe<span style="color: #9EE551;">.</span></h1>
                  <p style="color: #9EE551; font-weight: 600; margin: 5px 0;">${tagline}</p>
                </div>
                
                <h2 style="color: #1e293b; margin-bottom: 15px;">${greeting}</h2>
                
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">${message}</p>
                
                <p style="color: #374151; line-height: 1.6;">${stats}</p>
                
                <p style="color: #374151; line-height: 1.6; font-weight: 600;">${cta}</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${SITE_URL}/sessions" 
                     style="display: inline-block; background: #9EE551; color: #1e293b; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                    ${buttonText}
                  </a>
                </div>
                
                <div style="border-top: 1px solid #e5e7eb; margin-top: 30px; padding-top: 20px;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    ${isSpanish ? 'Tu comunidad de entrenamiento te extraña.' : 'Your training community misses you.'}
                  </p>
                </div>
              </div>
              
              <p style="text-align: center; color: #9ca3af; font-size: 11px; margin-top: 20px;">
                © ${new Date().getFullYear()} Tribe · ${tagline}
              </p>
            </div>
          `,
        });

        emailsSent++;

        // Stamp last_reengagement_sent ONLY on a confirmed send (resend.send
        // above did not throw), matching the engagement cron. A failed send
        // leaves it unstamped so the next run retries the user.
        await updateUser(supabase, user.id, { last_reengagement_sent: new Date().toISOString() });
      } catch (error: unknown) {
        logError(error, { route: '/api/send-inactive-nudge', action: 'send_nudge_email', userId: user.id });
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      emailsSent,
      errors,
      totalUsers: users.length,
    });
  } catch (error: unknown) {
    logError(error, { route: '/api/send-inactive-nudge', action: 'inactive_nudge' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
