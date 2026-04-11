// app/api/feedback/widget/route.ts
// ============================================================
// POST /api/feedback/widget
// Handles feedback from the floating widget: validates input,
// inserts into user_feedback table, sends email via Resend.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { logError } from '@/lib/logger';
import type { FeedbackCategory, FeedbackSubmitPayload } from '@/types/feedback';

// ---------------------------------------------------------------------------
// Service-role client (bypasses RLS for admin insert + user lookup)
// ---------------------------------------------------------------------------

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

function getResendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

const ADMIN_EMAIL = 'tribe@aplusfitnessllc.com';
const VALID_CATEGORIES: FeedbackCategory[] = ['bug', 'feature_request', 'general'];

// ---------------------------------------------------------------------------
// Category → human-readable labels (for the email)
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: 'Bug Report',
  feature_request: 'Feature Idea',
  general: 'General Feedback',
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/**
 * @description Receives feedback from the in-app widget and stores it.
 * @method POST
 * @auth Bearer token (user access token from Supabase auth)
 * @param {FeedbackSubmitPayload} request.body
 * @returns {{ success: boolean; feedbackId?: string; error?: string }}
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Authenticate the user via their access token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Missing authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    // 2. Parse and validate the payload
    const body = (await request.json()) as FeedbackSubmitPayload;

    if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json(
        { success: false, error: 'Invalid category. Must be: bug, feature_request, or general.' },
        { status: 400 }
      );
    }

    if (!body.message || body.message.trim().length < 10) {
      return NextResponse.json({ success: false, error: 'Message must be at least 10 characters.' }, { status: 400 });
    }

    if (body.message.trim().length > 2000) {
      return NextResponse.json({ success: false, error: 'Message must be under 2000 characters.' }, { status: 400 });
    }

    // 3. Build a title from the category + first chunk of the message
    const trimmedMessage = body.message.trim();
    const titleSnippet = trimmedMessage.length > 60 ? `${trimmedMessage.slice(0, 57)}...` : trimmedMessage;
    const generatedTitle = `[Widget] ${CATEGORY_LABELS[body.category]}: ${titleSnippet}`;

    // 4. Insert feedback into the existing user_feedback table
    //    Maps: category → type, message → description, auto-generated title
    const { data: feedback, error: insertError } = await supabaseAdmin
      .from('user_feedback')
      .insert({
        user_id: user.id,
        type: body.category,
        title: generatedTitle,
        description: trimmedMessage,
        status: 'new',
      })
      .select('id')
      .single();

    if (insertError) {
      logError(insertError, { action: 'widget-feedback-insert', userId: user.id });
      return NextResponse.json(
        { success: false, error: 'Failed to save feedback. Please try again.' },
        { status: 500 }
      );
    }

    // 5. Send email notification to admin (non-blocking)
    const platformInfo = body.deviceInfo?.platform ?? 'unknown';
    const versionInfo = body.appVersion ?? 'unknown';

    try {
      const resend = getResendClient();
      await resend.emails.send({
        from: 'Tribe Feedback <tribe@aplusfitnessllc.com>',
        to: [ADMIN_EMAIL],
        subject: `[Tribe Feedback] New ${CATEGORY_LABELS[body.category]} from ${user.email ?? 'unknown user'}`,
        text: [
          'New feedback received on Tribe (via widget)',
          '',
          `Category: ${CATEGORY_LABELS[body.category]}`,
          `User: ${user.email ?? user.id}`,
          `Platform: ${platformInfo}`,
          `App Version: ${versionInfo}`,
          '',
          'Message:',
          trimmedMessage,
          '',
          '---',
          `Feedback ID: ${feedback.id}`,
          `Submitted: ${new Date().toISOString()}`,
        ].join('\n'),
      });
    } catch (emailError) {
      // Non-blocking: feedback is saved even if email fails
      logError(emailError, { action: 'widget-feedback-email', feedbackId: feedback.id });
    }

    // Send SMS notification to admin (non-blocking)
    try {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
      const smsTo = process.env.FEEDBACK_SMS_NUMBER;

      if (twilioSid && twilioAuth && twilioFrom && smsTo) {
        const smsAuthHeader = Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64');
        const smsBody = `[Tribe] ${CATEGORY_LABELS[body.category]} from ${user.email ?? 'unknown'}: ${trimmedMessage.slice(0, 120)}`;

        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${smsAuthHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: smsTo,
            From: twilioFrom,
            Body: smsBody,
          }),
        });
      }
    } catch (smsError) {
      logError(smsError, { action: 'widget-feedback-sms', feedbackId: feedback.id });
    }

    // 6. Return success
    return NextResponse.json({
      success: true,
      feedbackId: feedback.id,
    });
  } catch (error) {
    logError(error, { action: 'widget-feedback-route' });
    return NextResponse.json({ success: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
