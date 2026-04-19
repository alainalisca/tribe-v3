// lib/data-access/feedback.ts
// ============================================================
// Data access layer for user_feedback table
// Follows the DAL pattern per engineering-standards.md
// ============================================================

import { createClient } from '@supabase/supabase-js';
import type {
  FeedbackCategory,
  FeedbackInsert,
  UserFeedback,
  DeviceInfo,
} from '@/types/feedback';

// ---------------------------------------------------------------------------
// Client-side operations (use the user's Supabase session)
// ---------------------------------------------------------------------------

/**
 * Submit feedback from the authenticated user.
 * Uses the browser Supabase client (inherits user session for RLS).
 */
export async function submitFeedback(
  supabase: ReturnType<typeof createClient>,
  payload: FeedbackInsert
): Promise<{ data: UserFeedback | null; error: string | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { data: null, error: 'User not authenticated' };
  }

  const { data, error } = await supabase
    .from('user_feedback')
    .insert({
      user_id: user.id,
      category: payload.category,
      message: payload.message,
      screenshot_url: payload.screenshot_url ?? null,
      device_info: payload.device_info ?? {},
      app_version: payload.app_version ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[feedback] Insert failed:', error.message);
    return { data: null, error: error.message };
  }

  return { data: data as UserFeedback, error: null };
}

/**
 * Upload a screenshot to Supabase Storage.
 * Files are stored under the user's ID folder for RLS compliance.
 * Returns the storage path (not a public URL, since the bucket is private).
 */
export async function uploadFeedbackScreenshot(
  supabase: ReturnType<typeof createClient>,
  file: File
): Promise<{ path: string | null; error: string | null }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { path: null, error: 'User not authenticated' };
  }

  const fileExt = file.name.split('.').pop() ?? 'png';
  const fileName = `${user.id}/${Date.now()}.${fileExt}`;

  const { error } = await supabase.storage
    .from('feedback-screenshots')
    .upload(fileName, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    console.error('[feedback] Screenshot upload failed:', error.message);
    return { path: null, error: error.message };
  }

  return { path: fileName, error: null };
}

/**
 * Get a signed URL for a feedback screenshot (valid for 1 hour).
 * Used by admin or the user viewing their own feedback.
 */
export async function getFeedbackScreenshotUrl(
  supabase: ReturnType<typeof createClient>,
  path: string
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('feedback-screenshots')
    .createSignedUrl(path, 3600);

  if (error) {
    console.error('[feedback] Signed URL failed:', error.message);
    return null;
  }

  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Server-side operations (use service role for admin access)
// ---------------------------------------------------------------------------

/**
 * Get all feedback entries (admin use).
 * Must be called with the service-role Supabase client.
 */
export async function getAllFeedback(
  supabaseAdmin: ReturnType<typeof createClient>,
  options?: {
    status?: string;
    category?: FeedbackCategory;
    limit?: number;
    offset?: number;
  }
): Promise<{ data: UserFeedback[]; error: string | null; count: number }> {
  let query = supabaseAdmin
    .from('user_feedback')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (options?.status) {
    query = query.eq('status', options.status);
  }
  if (options?.category) {
    query = query.eq('category', options.category);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 20) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[feedback] Fetch all failed:', error.message);
    return { data: [], error: error.message, count: 0 };
  }

  return { data: (data ?? []) as UserFeedback[], error: null, count: count ?? 0 };
}

/**
 * Update feedback status (admin use).
 */
export async function updateFeedbackStatus(
  supabaseAdmin: ReturnType<typeof createClient>,
  feedbackId: string,
  status: string,
  adminNotes?: string
): Promise<{ error: string | null }> {
  const updatePayload: Record<string, string> = { status };
  if (adminNotes !== undefined) {
    updatePayload.admin_notes = adminNotes;
  }

  const { error } = await supabaseAdmin
    .from('user_feedback')
    .update(updatePayload)
    .eq('id', feedbackId);

  if (error) {
    console.error('[feedback] Status update failed:', error.message);
    return { error: error.message };
  }

  return { error: null };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect device info from the current environment.
 * Works in both browser and Capacitor contexts.
 */
export function collectDeviceInfo(): DeviceInfo {
  const isCapacitor = typeof window !== 'undefined' && 'Capacitor' in window;

  return {
    platform: detectPlatform(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    screenWidth: typeof window !== 'undefined' ? window.screen.width : 0,
    screenHeight: typeof window !== 'undefined' ? window.screen.height : 0,
    nativePlatform: isCapacitor
      ? (window as Record<string, unknown>).Capacitor?.toString()
      : undefined,
  };
}

function detectPlatform(): 'ios' | 'android' | 'web' {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  if (ua.includes('android')) return 'android';
  return 'web';
}
