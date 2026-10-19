import { NextResponse } from 'next/server';
import { isValidCronAuth } from '@/lib/auth/cron';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { MOMENTS_BUCKET, momentAllPaths } from '@/lib/moments/paths';
import { log, logError } from '@/lib/logger';

/**
 * Nightly (T-MOM1): the files of photos soft-deleted more than 7 days ago
 * leave the moments bucket (original and both variants). The row keeps its
 * deleted_at as the record; removing a file that is already gone is a no-op,
 * so a re-run is safe. CRON_SECRET only.
 */
const GRACE_DAYS = 7;

export async function GET(req: Request) {
  if (!isValidCronAuth(req.headers.get('authorization'))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const service = getServiceRoleClient();
  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await service
      .from('session_media')
      .select('storage_path')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoff)
      .limit(500);
    if (error) throw error;
    const paths = ((data ?? []) as Array<{ storage_path: string }>).flatMap((m) => momentAllPaths(m.storage_path));
    if (paths.length) {
      const { error: rmErr } = await service.storage.from(MOMENTS_BUCKET).remove(paths);
      if (rmErr) throw rmErr;
    }
    log('info', 'moments-cleanup', { files: paths.length });
    return NextResponse.json({ files: paths.length });
  } catch (error) {
    logError(error, { action: 'cron.momentsCleanup' });
    return NextResponse.json({ error: 'cleanup_failed' }, { status: 500 });
  }
}
