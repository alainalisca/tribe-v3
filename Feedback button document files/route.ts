// app/api/feedback/route.ts
// ============================================================
// POST /api/feedback
// Handles feedback submission: validates, uploads screenshot,
// inserts to DB, sends email notification via Resend.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Service-role client for server-side operations (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY);

// ---------------------------------------------------------------------------
// Types (inline to keep the route self-contained; mirrors types/feedback.ts)
// ---------------------------------------------------------------------------

interface FeedbackPayload {
  category: 'bug' | 'feature_request' | 'general';
  message: string;
  screenshotBase64?: string | null;
  deviceInfo?: Record<string, unknown>;
  appVersion?: string;
}

const VALID_CATEGORIES = ['bug', 'feature_request', 'general'] as const;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate the user via their access token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Missing authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // 2. Parse and validate the payload
    const body: FeedbackPayload = await request.json();

    if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json(
        { success: false, error: 'Invalid category. Must be: bug, feature_request, or general.' },
        { status: 400 }
      );
    }

    if (!body.message || body.message.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'Message must be at least 10 characters.' },
        { status: 400 }
      );
    }

    // 3. Upload screenshot if provided
    let screenshotPath: string | null = null;

    if (body.screenshotBase64) {
      const buffer = Buffer.from(body.screenshotBase64, 'base64');
      const fileName = `${user.id}/${Date.now()}.png`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('feedback-screenshots')
        .upload(fileName, buffer, {
          contentType: 'image/png',
          upsert: false,
        });

      if (uploadError) {
        console.error('[feedback] Screenshot upload failed:', uploadError.message);
        // Non-blocking: continue without screenshot
      } else {
        screenshotPath = fileName;
      }
    }

    // 4. Insert feedback into the database
    const { data: feedback, error: insertError } = await supabaseAdmin
      .from('user_feedback')
      .insert({
        user_id: user.id,
        category: body.category,
        message: body.message.trim(),
        screenshot_url: screenshotPath,
        device_info: body.deviceInfo ?? {},
        app_version: body.appVersion ?? null,
        status: 'new',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[feedback] Insert failed:', insertError.message);
      return NextResponse.json(
        { success: false, error: 'Failed to save feedback. Please try again.' },
        { status: 500 }
      );
    }

    // 5. Send email notification to admin
    const categoryLabels: Record<string, string> = {
      bug: 'Bug Report',
      feature_request: 'Feature Idea',
      general: 'General Feedback',
    };

    const screenshotNote = screenshotPath
      ? '\n\nA screenshot was attached. View it in the Supabase Storage dashboard under feedback-screenshots.'
      : '';

    try {
      await resend.emails.send({
        from: 'Tribe Feedback <tribe@aplusfitnessllc.com>',
        to: ['tribe@aplusfitnessllc.com'],
        subject: `[Tribe Feedback] New ${categoryLabels[body.category]} from ${user.email ?? 'unknown user'}`,
        text: [
          `New feedback received on Tribe`,
          ``,
          `Category: ${categoryLabels[body.category]}`,
          `User: ${user.email ?? user.id}`,
          `Platform: ${(body.deviceInfo as Record<string, unknown>)?.platform ?? 'unknown'}`,
          `App Version: ${body.appVersion ?? 'unknown'}`,
          ``,
          `Message:`,
          `${body.message.trim()}`,
          screenshotNote,
          ``,
          `---`,
          `Feedback ID: ${feedback.id}`,
          `Submitted: ${new Date().toISOString()}`,
        ].join('\n'),
      });
    } catch (emailError) {
      // Non-blocking: feedback is saved even if email fails
      console.error('[feedback] Email notification failed:', emailError);
    }

    // 6. Return success
    return NextResponse.json({
      success: true,
      feedbackId: feedback.id,
    });
  } catch (error) {
    console.error('[feedback] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
