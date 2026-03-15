import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const jwt = require('jsonwebtoken');

const TARGET_USER_ID = 'eaff348f-5df3-4df5-bd80-69ec233aad0e';

export async function GET() {
  const logs: string[] = [];
  const addLog = (msg: string) => logs.push(`[${new Date().toISOString()}] ${msg}`);

  try {
    // Step 1: Read service account
    addLog('Step 1: Reading FIREBASE_SERVICE_ACCOUNT_KEY...');
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) {
      addLog('FATAL: FIREBASE_SERVICE_ACCOUNT_KEY not set');
      return NextResponse.json({ logs });
    }
    addLog(`Env var found, length: ${raw.length}`);

    let parsed: { client_email: string; private_key: string; project_id: string };
    try {
      parsed = JSON.parse(raw);
      addLog(`Parsed OK — project_id: ${parsed.project_id}, client_email: ${parsed.client_email}`);
      addLog(`private_key exists: ${!!parsed.private_key}, length: ${parsed.private_key?.length}`);
    } catch (parseErr) {
      addLog(`FATAL: JSON parse failed — ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
      return NextResponse.json({ logs });
    }

    // Step 2: Generate JWT
    addLog('Step 2: Generating JWT...');
    let jwtToken: string;
    try {
      const now = Math.floor(Date.now() / 1000);
      jwtToken = jwt.sign(
        {
          iss: parsed.client_email,
          sub: parsed.client_email,
          aud: 'https://oauth2.googleapis.com/token',
          iat: now,
          exp: now + 3600,
          scope: 'https://www.googleapis.com/auth/firebase.messaging',
        },
        parsed.private_key,
        { algorithm: 'RS256' }
      );
      addLog(`JWT generated OK, length: ${jwtToken.length}`);
    } catch (jwtErr) {
      addLog(`FATAL: JWT signing failed — ${jwtErr instanceof Error ? jwtErr.message : String(jwtErr)}`);
      return NextResponse.json({ logs });
    }

    // Step 3: Exchange JWT for access token
    addLog('Step 3: Exchanging JWT for OAuth2 access token...');
    let accessToken: string;
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwtToken}`,
      });
      const tokenData = await tokenResponse.json();
      addLog(`OAuth2 response status: ${tokenResponse.status}`);

      if (tokenData.access_token) {
        accessToken = tokenData.access_token;
        addLog(`Access token obtained, length: ${accessToken.length}`);
      } else {
        addLog(`FATAL: No access_token in response — ${JSON.stringify(tokenData)}`);
        return NextResponse.json({ logs });
      }
    } catch (tokenErr) {
      addLog(`FATAL: OAuth2 exchange failed — ${tokenErr instanceof Error ? tokenErr.message : String(tokenErr)}`);
      return NextResponse.json({ logs });
    }

    // Step 4: Read FCM token from database
    addLog('Step 4: Reading FCM token from database...');
    let fcmToken: string;
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('users')
        .select('fcm_token, fcm_platform, fcm_updated_at, name')
        .eq('id', TARGET_USER_ID)
        .single();

      if (error) {
        addLog(`FATAL: DB query failed — ${error.message}`);
        return NextResponse.json({ logs });
      }

      addLog(`User found: ${data.name}`);
      addLog(`fcm_platform: ${data.fcm_platform}`);
      addLog(`fcm_updated_at: ${data.fcm_updated_at}`);
      addLog(`fcm_token: ${data.fcm_token ? data.fcm_token.substring(0, 30) + '...' : 'null'}`);

      if (!data.fcm_token) {
        addLog('FATAL: User has no fcm_token in database');
        return NextResponse.json({ logs });
      }
      fcmToken = data.fcm_token;
    } catch (dbErr) {
      addLog(`FATAL: DB error — ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      return NextResponse.json({ logs });
    }

    // Step 5: Send FCM notification
    addLog('Step 5: Sending FCM notification via HTTP v1 API...');
    try {
      const message = {
        message: {
          token: fcmToken,
          notification: {
            title: 'Tribe Debug Test',
            body: `Test notification sent at ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/Bogota' })}`,
          },
          data: { type: 'debug_test', url: '/settings' },
          android: {
            priority: 'high' as const,
            notification: {
              sound: 'default',
              channel_id: 'tribe_notifications',
              icon: 'ic_notification',
              color: '#C0E863',
            },
          },
          apns: {
            headers: { 'apns-priority': '10' },
            payload: { aps: { sound: 'default', badge: 1 } },
          },
        },
      };

      const fcmUrl = `https://fcm.googleapis.com/v1/projects/${parsed.project_id}/messages:send`;
      addLog(`FCM URL: ${fcmUrl}`);
      addLog(`Request body: ${JSON.stringify(message).substring(0, 200)}...`);

      const fcmResponse = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const fcmStatus = fcmResponse.status;
      const fcmHeaders: Record<string, string> = {};
      fcmResponse.headers.forEach((value, key) => {
        fcmHeaders[key] = value;
      });
      const fcmBody = await fcmResponse.json();

      addLog(`FCM response status: ${fcmStatus}`);
      addLog(`FCM response headers: ${JSON.stringify(fcmHeaders)}`);
      addLog(`FCM response body: ${JSON.stringify(fcmBody)}`);

      if (fcmStatus === 200) {
        addLog(`SUCCESS — message name: ${fcmBody.name}`);
      } else {
        addLog(`FAILED — error code: ${fcmBody.error?.code}, message: ${fcmBody.error?.message}`);
        addLog(`Full error details: ${JSON.stringify(fcmBody.error?.details)}`);
      }
    } catch (fcmErr) {
      addLog(`FATAL: FCM send failed — ${fcmErr instanceof Error ? fcmErr.message : String(fcmErr)}`);
    }

    addLog('Done.');
    return NextResponse.json({ logs });
  } catch (outerErr) {
    addLog(`UNEXPECTED ERROR: ${outerErr instanceof Error ? outerErr.message : String(outerErr)}`);
    return NextResponse.json({ logs });
  }
}
