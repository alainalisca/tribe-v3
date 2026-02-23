import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import admin from 'firebase-admin';
import webpush from 'web-push';

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
      fcm_token: userRecord?.fcm_token ? `${userRecord.fcm_token.substring(0, 20)}... (length: ${userRecord.fcm_token.length})` : null,
      fcm_platform: userRecord?.fcm_platform || null,
      push_subscription: userRecord?.push_subscription ? 'exists' : null,
    };

    // Firebase Admin init diagnostics
    let firebaseDiag: Record<string, any> = {};
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccountKey) {
      firebaseDiag.error = 'FIREBASE_SERVICE_ACCOUNT_KEY env var not set';
    } else {
      firebaseDiag.keyPresent = true;
      firebaseDiag.keyLength = serviceAccountKey.length;
      firebaseDiag.keyPrefix = serviceAccountKey.substring(0, 30) + '...';

      try {
        const parsed = JSON.parse(serviceAccountKey);
        firebaseDiag.jsonValid = true;
        firebaseDiag.project_id = parsed.project_id || 'MISSING';
        firebaseDiag.client_email = parsed.client_email || 'MISSING';
        firebaseDiag.private_key_present = !!parsed.private_key;
        firebaseDiag.private_key_length = parsed.private_key?.length || 0;
      } catch (e: any) {
        firebaseDiag.jsonValid = false;
        firebaseDiag.jsonError = e.message;
      }

      // Try actual Firebase init
      try {
        if (admin.apps.length === 0) {
          const parsed = JSON.parse(serviceAccountKey);
          admin.initializeApp({ credential: admin.credential.cert(parsed) });
        }
        firebaseDiag.initSuccess = true;
        firebaseDiag.appsCount = admin.apps.length;
      } catch (e: any) {
        firebaseDiag.initSuccess = false;
        firebaseDiag.initError = e.message;
      }
    }

    // Test private key signing
    const crypto = require('crypto');
    let keyTest = 'untested';
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
      const sign = crypto.createSign('RSA-SHA256');
      sign.update('test');
      sign.sign(parsed.private_key, 'base64');
      keyTest = 'valid — private key can sign';
    } catch (e: any) {
      keyTest = `invalid — ${e.message}`;
    }
    firebaseDiag.keyTest = keyTest;

    // VAPID / web-push diagnostics
    const vapidDiag = {
      publicKeySet: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      privateKeySet: !!process.env.VAPID_PRIVATE_KEY,
      emailSet: !!process.env.VAPID_EMAIL,
    };

    // If user has FCM token, try a direct send
    let fcmTestResult: Record<string, any> | null = null;
    if (userRecord?.fcm_token && firebaseDiag.initSuccess) {
      try {
        const message = {
          token: userRecord.fcm_token,
          notification: {
            title: '🎉 Direct FCM Test',
            body: 'FCM direct send working!',
          },
          data: { url: '/' },
        };
        const fcmResponse = await admin.messaging().send(message);
        fcmTestResult = { success: true, messageId: fcmResponse };
      } catch (e: any) {
        fcmTestResult = { success: false, error: e.message, code: e.code || null };
      }
    }

    // Also call the /send route for the full pipeline test
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
      firebase: firebaseDiag,
      vapid: vapidDiag,
      fcmDirectTest: fcmTestResult,
      sendPipelineResult: sendResult,
      sendPipelineStatus: response.status,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
