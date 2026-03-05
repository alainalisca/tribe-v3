import { createClient } from '@/lib/supabase/server';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { fetchParticipationsWithSession, fetchSessionsByCreator, fetchUsersForAdmin } from '@/lib/dal';

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
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    const usersResult = await fetchUsersForAdmin(supabase);
    const allUsers = usersResult.data || [];
    const users = allUsers.filter((u) => u.email != null);

    if (users.length === 0) {
      return NextResponse.json({ error: 'No users found' }, { status: 400 });
    }

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoStr = oneWeekAgo.toISOString().split('T')[0];

    let emailsSent = 0;
    let errors = 0;

    for (const user of users) {
      try {
        const participatedResult = await fetchParticipationsWithSession(supabase, user.id, {
          status: 'accepted',
          dateGte: oneWeekAgoStr,
          userJoinFields: 'session:sessions(id, sport, location, date, start_time, creator:users!creator_id(name))',
        });
        const participatedSessions = (participatedResult.data || []) as Array<{
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
            sessionsHTML += `<li style="margin: 8px 0;"><strong>${session.sport}</strong> at ${session.location} (${new Date(session.date + 'T00:00:00').toLocaleDateString()})</li>`;
          }
          sessionsHTML += '</ul>';
        }

        if (hostedSessions.length > 0) {
          sessionsHTML += `<h3 style="color: #1e293b; margin-top: 20px;">${hostedHeader}</h3><ul style="color: #374151;">`;
          for (const session of hostedSessions) {
            sessionsHTML += `<li style="margin: 8px 0;"><strong>${session.sport}</strong> at ${session.location} (${new Date(session.date + 'T00:00:00').toLocaleDateString()})</li>`;
          }
          sessionsHTML += '</ul>';
        }

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
      totalUsers: users.length,
    });
  } catch (error: unknown) {
    logError(error, { route: '/api/send-weekly-recap', action: 'weekly_recap' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
