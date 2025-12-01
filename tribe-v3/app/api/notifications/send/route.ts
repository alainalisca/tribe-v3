import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(request: Request) {
  try {
    const { userId, title, body, url } = await request.json();

    if (!userId || !title || !body) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user's push subscription from users table
    const { data: user, error } = await supabase
      .from('users')
      .select('push_subscription')
      .eq('id', userId)
      .single();

    if (error || !user?.push_subscription) {
      return NextResponse.json(
        { error: 'No push subscription found for user' },
        { status: 404 }
      );
    }

    // Parse the subscription (stored as JSON string)
    const subscription = typeof user.push_subscription === 'string' 
      ? JSON.parse(user.push_subscription) 
      : user.push_subscription;

    const payload = JSON.stringify({
      title,
      body,
      url: url || '/'
    });

    await webpush.sendNotification(subscription, payload);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error sending push notification:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
