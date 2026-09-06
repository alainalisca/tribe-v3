/**
 * POST /api/video/direct-upload
 *
 * Mints a one time Cloudflare Stream upload URL for an instructor's intro
 * video. The browser uploads straight to Cloudflare with the returned URL, so
 * the account token never reaches the client and the bytes never touch Vercel.
 *
 * Three gates, in this order, and the order matters:
 *   1. Configuration. Without credentials there is nothing to mint, so this
 *      fails closed with a 503 before any database work happens.
 *   2. Authentication. A minted URL is a write capability; anonymous callers
 *      do not get one.
 *   3. Instructor. Intro videos are an instructor surface. Without this gate
 *      any signed in account could mint URLs against the account's Stream
 *      quota, which is both a cost problem and a way to push video into a
 *      surface the caller has no business writing to.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { log, logError } from '@/lib/logger';
import { createDirectUpload } from '@/lib/video/stream';

const ROUTE = 'POST /api/video/direct-upload';

/**
 * Read at call time, not at module load, so a Vercel environment change takes
 * effect without a redeploy of module state. Same convention as the payment
 * routes and the Stripe Connect routes.
 */
function isStreamConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_STREAM_TOKEN);
}

export async function POST(_request: NextRequest): Promise<NextResponse> {
  try {
    if (!isStreamConfigured()) {
      // 503, not 500: the deployment is missing configuration, which is an
      // operator problem, not a caller problem. Logged so a misconfigured
      // environment is visible rather than silently rejecting every upload.
      log('warn', 'video_direct_upload_blocked', {
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

    // Service role read: is_instructor is the gate itself, so it is read with
    // the trusted client rather than through whatever the caller can see.
    const { data: profile, error: profileError } = await getServiceRoleClient()
      .from('users')
      .select('id, is_instructor')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      logError(profileError, { route: ROUTE, action: 'load_profile', userId: user.id });
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }

    if (!profile.is_instructor) {
      log('warn', 'video_direct_upload_forbidden', {
        route: ROUTE,
        action: 'not_an_instructor',
        userId: user.id,
      });
      return NextResponse.json({ success: false, error: 'Only instructors can upload video' }, { status: 403 });
    }

    // Defaults live in lib/video/stream.ts and are the cost control: they cap
    // the storage Cloudflare reserves and how long an unused link survives.
    const { uploadURL, uid } = await createDirectUpload();

    return NextResponse.json({ success: true, data: { uploadURL, uid } });
  } catch (error: unknown) {
    logError(error, { route: ROUTE, action: 'mint_direct_upload' });
    return NextResponse.json({ success: false, error: 'Could not start the upload' }, { status: 502 });
  }
}
