import { getServiceRoleClient } from '@/lib/supabase/admin';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { fetchParticipationsWithSession, fetchSessionsByCreator, fetchUsersForEmailJobs } from '@/lib/dal';
import { formatSessionLocation } from '@/lib/sessionLocation';
import { isValidCronAuth } from '@/lib/auth/cron';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';
import { isEmailSuppressed, unsubUrlFor, unsubHeaders } from '@/lib/dal/emailUnsubscribe';
import { bogotaDateOffset } from '@/lib/time/bogotaDate';
import { dateLocale } from '@/lib/dateLocale';

function getResendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tribe-v3.vercel.app';

/**
 * @description Sends weekly recap emails to all users who participated in or hosted sessions during the past week, summarizing their activity.
 * @method POST
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header.
 * @param {void} request.body - No request body expected; all active users are processed automatically.
 * @returns {{ success: boolean, emailsSent: number, errors: number, totalUsers: number }} Summary of emails sent and any failures.
 */
export async function POST(request: Request) {
  try {
    const resend = getResendClient();
    // T1-3: fail CLOSED via the shared helper (see send-inactive-nudge).
    if (!isValidCronAuth(request.headers.get('authorization'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Backend batch job: service-role. The anon/authenticated roles cannot read
    // the `users` columns this job needs (migrations 067 + 113), and its
    // per-user activity queries below should not be RLS-scoped to a session.
    const supabase = getServiceRoleClient();

    const usersResult = await fetchUsersForEmailJobs(supabase);
    // A failed query must NOT look like "nobody to email" — that is how this
    // job went silently dead under the 067 revoke. Surface it.
    if (!usersResult.success) {
      logError(usersResult.error, { action: 'sendWeeklyRecap.fetchUsers' });
      return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
    }

    const users = (usersResult.data ?? []).filter((u) => u.email != null);

    // Genuinely zero eligible recipients is a success, not an error.
    if (users.length === 0) {
      return NextResponse.json({ success: true, emailsSent: 0, errors: 0, totalUsers: 0 });
    }

    // T0-9: Bogota-local date — this is compared to session.date (local).
    const oneWeekAgoStr = bogotaDateOffset(-7);

    let emailsSent = 0;
    let errors = 0;
    let suppressed = 0;

    for (const user of users) {
      try {
        const participatedResult = await fetchParticipationsWithSession(supabase, user.id, {
          status: 'accepted',
          dateGte: oneWeekAgoStr,
          userJoinFields: 'session:sessions(id, sport, location, date, start_time, creator:users!creator_id(name))',
        });
        const participatedSessions = (participatedResult.data || []) as unknown as Array<{
          session: {
            id: string;
            sport: string;
            location: string;
            date: string;
            start_time: string;
            creator: { name: string };
          };
        }>;

        const hostedResult = await fetchSessionsByCreator(supabase, user.id, {
          dateGte: oneWeekAgoStr,
          fields: 'id, sport, location, date, start_time',
        });
        const hostedSessions = (hostedResult.data || []) as Array<{
          id: string;
          sport: string;
          location: string;
          date: string;
          start_time: string;
        }>;

        const totalSessions = participatedSessions.length + hostedSessions.length;

        if (totalSessions === 0) continue;

        // THE GATE THIS ROUTE NEVER HAD.
        //
        // AFTER the activity check, deliberately. Placed before it, `suppressed`
        // would count every user with a quiet week alongside every user who
        // opted out, and a metric that conflates "nothing to say" with "asked
        // us to stop" is the kind of number that later gets quoted as
        // opt-out rate.
        //
        // TYPE_META declares weekly_recap as email:'opt_in' -- it requires
        // affirmative consent AND the weekly_recap category. This route read
        // no preference at all and emailed every user who had an address, so
        // the declared policy and the code disagreed and the code won. It has
        // never carried an unsubscribe link either.
        //
        // Two checks, in this order, because they answer different questions:
        // isEmailSuppressed is "did this person tell us to stop" (hard, and
        // outranks everything), shouldSendNotification is "does the policy for
        // this type permit it".
        if (await isEmailSuppressed(supabase, user.id)) {
          suppressed++;
          continue;
        }
        if (!(await shouldSendNotification(supabase, user.id, 'weekly_recap', 'email'))) {
          suppressed++;
          continue;
        }

        // NO LINK MEANS NO SEND. A recurring email with no way out is what
        // this mechanism exists to end; a missing token is 189's backfill not
        // having reached this row, which is a bug to see rather than to paper
        // over by sending anyway.
        const unsub = await unsubUrlFor(supabase, user.id, SITE_URL);
        if (!unsub.success || !unsub.data) {
          logError(new Error(unsub.error ?? 'no unsubscribe token'), {
            route: '/api/send-weekly-recap',
            action: 'unsubUrl',
            userId: user.id,
          });
          errors++;
          continue;
        }
        const unsubUrl = unsub.data;

        const lang = user.preferred_language || 'en';
        const isSpanish = lang === 'es';

        const subject = isSpanish ? `📊 Tu resumen semanal de Tribe` : `📊 Your Tribe weekly recap`;

        const greeting = isSpanish ? `¡Hola ${user.name}! 👋` : `Hi ${user.name}! 👋`;

        const summary = isSpanish
          ? `Esta semana tuviste <strong>${totalSessions} ${totalSessions === 1 ? 'sesión' : 'sesiones'}</strong>.`
          : `You had <strong>${totalSessions} ${totalSessions === 1 ? 'session' : 'sessions'}</strong> this week.`;

        const participatedHeader = isSpanish ? 'Sesiones en las que participaste:' : 'Sessions you joined:';
        const hostedHeader = isSpanish ? 'Sesiones que organizaste:' : 'Sessions you hosted:';
        const keepGoing = isSpanish ? '¡Sigue así! Nunca entrenes solo. 💪' : 'Keep it up! Never train alone. 💪';
        const findMore = isSpanish ? 'Encuentra más sesiones' : 'Find more sessions';
        const tagline = isSpanish ? 'Nunca Entrenes Solo' : 'Never Train Alone';

        let sessionsHTML = '';

        if (participatedSessions.length > 0) {
          sessionsHTML += `<h3 style="color: #1e293b; margin-top: 20px;">${participatedHeader}</h3><ul style="color: #374151;">`;
          for (const item of participatedSessions) {
            const session = item.session;
            const loc = formatSessionLocation(
              session.location,
              (session as { latitude?: number | null }).latitude ?? null,
              (session as { longitude?: number | null }).longitude ?? null,
              isSpanish ? 'es' : 'en'
            );
            const atWord = isSpanish ? 'en' : 'at';
            sessionsHTML += `<li style="margin: 8px 0;"><strong>${session.sport}</strong> ${atWord} ${loc} (${new Date(session.date + 'T00:00:00').toLocaleDateString(dateLocale(lang))})</li>`;
          }
          sessionsHTML += '</ul>';
        }

        if (hostedSessions.length > 0) {
          sessionsHTML += `<h3 style="color: #1e293b; margin-top: 20px;">${hostedHeader}</h3><ul style="color: #374151;">`;
          for (const session of hostedSessions) {
            const loc = formatSessionLocation(
              session.location,
              (session as { latitude?: number | null }).latitude ?? null,
              (session as { longitude?: number | null }).longitude ?? null,
              isSpanish ? 'es' : 'en'
            );
            const atWord = isSpanish ? 'en' : 'at';
            sessionsHTML += `<li style="margin: 8px 0;"><strong>${session.sport}</strong> ${atWord} ${loc} (${new Date(session.date + 'T00:00:00').toLocaleDateString(dateLocale(lang))})</li>`;
          }
          sessionsHTML += '</ul>';
        }

        await resend.emails.send({
          from: 'Tribe <tribe@aplusfitnessllc.com>',
          to: user.email,
          subject: subject,
          headers: unsubHeaders(unsubUrl),
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
              <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h1 style="font-size: 28px; margin: 0;">Tribe<span style="color: #9EE551;">.</span></h1>
                  <p style="color: #9EE551; font-weight: 600; margin: 5px 0;">${tagline}</p>
                </div>
                
                <h2 style="color: #1e293b; margin-bottom: 15px;">${greeting}</h2>
                
                <p style="color: #374151; line-height: 1.6; font-size: 16px;">${summary}</p>
                
                ${sessionsHTML}
                
                <p style="color: #374151; line-height: 1.6; margin-top: 20px;">${keepGoing}</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${SITE_URL}/sessions" 
                     style="display: inline-block; background: #9EE551; color: #1e293b; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                    ${findMore}
                  </a>
                </div>
                
                <div style="border-top: 1px solid #e5e7eb; margin-top: 30px; padding-top: 20px;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    ${isSpanish ? 'Recibiste este email porque eres miembro activo de Tribe.' : 'You received this email because you are an active Tribe member.'}
                  </p>
                  <p style="color: #9ca3af; font-size: 12px; margin: 8px 0 0;">
                    <a href="${unsubUrl}" style="color: #9ca3af;">${isSpanish ? 'Cancelar la suscripción a estos correos' : 'Unsubscribe from these emails'}</a>
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
      } catch (error: unknown) {
        logError(error, { route: '/api/send-weekly-recap', action: 'send_recap_email', userId: user.id });
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      emailsSent,
      errors,
      suppressed,
      totalUsers: users.length,
    });
  } catch (error: unknown) {
    logError(error, { route: '/api/send-weekly-recap', action: 'weekly_recap' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
