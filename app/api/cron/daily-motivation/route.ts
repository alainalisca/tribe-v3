import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getRandomMessage, getMessageContent } from '@/lib/motivational-messages';
import { logError } from '@/lib/logger';

/**
 * @description Sends daily motivational push notifications to users who have push subscriptions and haven't received one today.
 * @method GET
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header.
 * @returns {{ success: boolean, message: string, count: number }} Number of motivational messages sent.
 */
export async function GET(request: Request) {
  try {
    // Verify this is from Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Get users who haven't received motivation today and have notifications enabled
    const today = new Date().toISOString().split('T')[0];

    const { data: users, error } = await supabase
      .from('users')
      .select('id, preferred_language, push_subscription')
      .neq('push_subscription', null)
      .or(`last_motivation_sent.is.null,last_motivation_sent.lt.${today}`);

    if (error) throw error;

    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'No users need motivation today', count: 0 });
    }

    let sentCount = 0;

    // Send motivation to each user
    for (const user of users) {
      const { message } = getRandomMessage('morning_motivation');
      const language = (user.preferred_language || 'en') as 'en' | 'es';
      const content = getMessageContent(message, language);

      try {
        // Send push notification
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL!}/api/notifications/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            title: content.title,
            body: content.body,
            url: '/',
          }),
        });

        // Update last motivation sent timestamp
        await supabase.from('users').update({ last_motivation_sent: new Date().toISOString() }).eq('id', user.id);

        sentCount++;
      } catch (err) {
        logError(err, { route: '/api/cron/daily-motivation', action: 'send_motivation', userId: user.id });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${sentCount} motivational messages`,
      count: sentCount,
    });
  } catch (error: unknown) {
    logError(error, { route: '/api/cron/daily-motivation', action: 'daily_motivation' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
