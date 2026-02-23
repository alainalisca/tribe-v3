import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tribe-v3.vercel.app';
    const userId = 'eaff348f-5df3-4df5-bd80-69ec233aad0e';

    // Query user record for notification diagnostics
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('id, name, fcm_token, fcm_platform, push_subscription')
      .eq('id', userId)
      .single();

    const diagnostics = {
      userId,
      userFound: !!userRecord,
      userError: userError?.message || null,
      name: userRecord?.name || null,
      fcm_token: userRecord?.fcm_token || null,
      fcm_platform: userRecord?.fcm_platform || null,
      push_subscription: userRecord?.push_subscription ? 'exists' : null,
    };

    // Attempt to send the test notification
    const response = await fetch(`${SITE_URL}/api/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        title: '🎉 Test Notification',
        body: 'Push notifications are working!',
        url: '/'
      })
    });

    const sendResult = await response.json();

    return NextResponse.json({
      success: true,
      diagnostics,
      sendResult,
      sendStatus: response.status,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
