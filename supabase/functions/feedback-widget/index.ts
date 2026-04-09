// supabase/functions/feedback-widget/index.ts
// ============================================================
// Supabase Edge Function: feedback-widget
// Production replacement for /api/feedback/widget route.
// Validates auth, inserts into user_feedback, sends email via Resend.
//
// Deploy:
//   supabase functions deploy feedback-widget --project-ref twyplulysepbeypqralz
//
// Required secrets (set via Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL            (auto-set by Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)
//   RESEND_API_KEY
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FeedbackCategory = "bug" | "feature_request" | "general";

interface FeedbackPayload {
  category: FeedbackCategory;
  message: string;
  deviceInfo?: {
    platform?: string;
    userAgent?: string;
    screenWidth?: number;
    screenHeight?: number;
    nativePlatform?: string;
  };
  appVersion?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_CATEGORIES: FeedbackCategory[] = ["bug", "feature_request", "general"];
const ADMIN_EMAIL = "tribe@aplusfitnessllc.com";

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug Report",
  feature_request: "Feature Idea",
  general: "General Feedback",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Helper: send email via Resend REST API
// ---------------------------------------------------------------------------

async function sendResendEmail(
  apiKey: string,
  to: string,
  subject: string,
  text: string
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tribe Feedback <tribe@aplusfitnessllc.com>",
      to: [to],
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

// ---------------------------------------------------------------------------
// Edge Function handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Read env vars
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 2. Authenticate the user via their access token
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse and validate payload
    const body: FeedbackPayload = await req.json();

    if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid category. Must be: bug, feature_request, or general." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    if (!body.message || body.message.trim().length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: "Message must be at least 10 characters." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    if (body.message.trim().length > 2000) {
      return new Response(
        JSON.stringify({ success: false, error: "Message must be under 2000 characters." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 4. Build title and insert into user_feedback
    const trimmedMessage = body.message.trim();
    const titleSnippet =
      trimmedMessage.length > 60
        ? `${trimmedMessage.slice(0, 57)}...`
        : trimmedMessage;
    const generatedTitle = `[Widget] ${CATEGORY_LABELS[body.category]}: ${titleSnippet}`;

    const { data: feedback, error: insertError } = await supabaseAdmin
      .from("user_feedback")
      .insert({
        user_id: user.id,
        type: body.category,
        title: generatedTitle,
        description: trimmedMessage,
        status: "new",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[feedback-widget] Insert failed:", insertError.message);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to save feedback. Please try again." }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 5. Send email notification (non-blocking)
    if (resendApiKey) {
      const platformInfo = body.deviceInfo?.platform ?? "unknown";
      const versionInfo = body.appVersion ?? "unknown";

      try {
        await sendResendEmail(
          resendApiKey,
          ADMIN_EMAIL,
          `[Tribe Feedback] New ${CATEGORY_LABELS[body.category]} from ${user.email ?? "unknown user"}`,
          [
            "New feedback received on Tribe (via widget)",
            "",
            `Category: ${CATEGORY_LABELS[body.category]}`,
            `User: ${user.email ?? user.id}`,
            `Platform: ${platformInfo}`,
            `App Version: ${versionInfo}`,
            "",
            "Message:",
            trimmedMessage,
            "",
            "---",
            `Feedback ID: ${feedback.id}`,
            `Submitted: ${new Date().toISOString()}`,
          ].join("\n")
        );
      } catch (emailError) {
        console.error("[feedback-widget] Email failed:", emailError);
      }
    } else {
      console.warn("[feedback-widget] RESEND_API_KEY not set, skipping email");
    }

    // 6. Return success
    return new Response(
      JSON.stringify({ success: true, feedbackId: feedback.id }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[feedback-widget] Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "An unexpected error occurred." }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
