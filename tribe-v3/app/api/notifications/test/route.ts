import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Hardcode your user ID for testing
    const userId = 'eaff348f-5df3-4df5-bd80-69ec233aad0e';

    // Send test notification
    const response = await fetch('http://localhost:3000/api/notifications/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        title: '🎉 Test Notification',
        body: 'Push notifications are working! You\'ll get reminders 2 hours before your sessions.',
        url: '/'
      })
    });

    const result = await response.json();

    return NextResponse.json({ 
      success: true, 
      message: 'Test notification sent!',
      result 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
