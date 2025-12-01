import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tribe-v3.vercel.app';
    const userId = '2ff3d10f-79e0-494a-a3fb-aabb8de51cd4';

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

    const result = await response.json();
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
