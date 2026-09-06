/**
 * POST /api/video/delete
 *
 * Permanently removes a Cloudflare Stream video and frees its minutes.
 * Stream never overwrites: replacing an intro video mints a new uid and the
 * old one keeps billing storage forever unless something deletes it. This is
 * that something.
 *
 * Server side because deleteVideo needs the account token, which must never
 * reach a browser.
 *
 * Gates in the same order as the mint route: configuration, authentication,
 * is_instructor. Then ownership, which is the one that matters here, because
 * without it any instructor could delete any other instructor's video by
 * guessing a uid.
 *
 * How ownership works, and why it is not simply "is this uid in your row".
 * The caller reaches this route AFTER their new uid has already been written,
 * which is the correct order: deleting before a confirmed write risks leaving
 * an instructor with no video at all. So by the time the old uid arrives here
 * it is nobody's current value. A uid is therefore deletable when it is
 * either the caller's own current video, which is the removal case, or not
 * claimed by any user at all, which is the just replaced orphan case. A uid
 * that belongs to somebody else is refused.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { log, logError } from '@/lib/logger';
import { deleteVideo } from '@/lib/video/stream';

const ROUTE = 'POST /api/video/delete';

/** Read at call time so a Vercel environment change needs no redeploy. */
function isStreamConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_STREAM_TOKEN);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isStreamConfigured()) {
      log('warn', 'video_delete_blocked', {
        route: ROUTE,
        action: 'stream_not_configured',
      });
      return NextResponse.json({ success: false, error: 'stream_not_configured' }, { status: 503 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceRoleClient();

    const { data: profile, error: profileError } = await service
      .from('users')
      .select('id, is_instructor, storefront_video_url')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      logError(profileError, { route: ROUTE, action: 'load_profile', userId: user.id });
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }

    if (!profile.is_instructor) {
      log('warn', 'video_delete_forbidden', { route: ROUTE, action: 'not_an_instructor', userId: user.id });
      return NextResponse.json({ success: false, error: 'Only instructors can delete video' }, { status: 403 });
    }

    const body: unknown = await request.json().catch(() => null);
    const uid =
      body && typeof body === 'object' && typeof (body as { uid?: unknown }).uid === 'string'
        ? (body as { uid: string }).uid.trim()
        : '';

    // A full URL is a legacy Supabase object, not a Stream video. Refuse
    // rather than handing an arbitrary string to the Stream API.
    if (!uid || uid.toLowerCase().startsWith('http')) {
      return NextResponse.json({ success: false, error: 'A Stream uid is required' }, { status: 400 });
    }

    // Ownership. Never trust the body: ask who currently claims this uid.
    if (profile.storefront_video_url !== uid) {
      const { data: claimant, error: claimError } = await service
        .from('users')
        .select('id')
        .eq('storefront_video_url', uid)
        .maybeSingle();

      if (claimError) {
        logError(claimError, { route: ROUTE, action: 'ownership_lookup', userId: user.id });
        return NextResponse.json({ success: false, error: 'Could not verify ownership' }, { status: 500 });
      }

      if (claimant && claimant.id !== user.id) {
        log('warn', 'video_delete_forbidden', {
          route: ROUTE,
          action: 'uid_belongs_to_another_user',
          userId: user.id,
        });
        return NextResponse.json({ success: false, error: 'Not your video' }, { status: 403 });
      }
    }

    await deleteVideo(uid);

    return NextResponse.json({ success: true, data: { uid } });
  } catch (error: unknown) {
    logError(error, { route: ROUTE, action: 'delete_video' });
    return NextResponse.json({ success: false, error: 'Could not delete the video' }, { status: 502 });
  }
}
