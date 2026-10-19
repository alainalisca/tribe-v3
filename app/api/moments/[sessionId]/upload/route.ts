import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { guardMomentsManager, PRIVATE, fail } from '@/lib/moments/routeGuard';
import { processMoment } from '@/lib/moments/process';
import { signMoments, storeMoment } from '@/lib/moments/storage';
import { momentOriginalPath } from '@/lib/moments/paths';
import { logError } from '@/lib/logger';
import type { MomentItem } from '@/lib/moments/types';

/**
 * POST /api/moments/<session>/upload/ (T-MOM1): one photo, multipart field
 * `file` (already resized to 2400 px in the browser, so well under the 4.5 MB
 * body limit), optional `takenAt` (ISO, read from EXIF in the browser before
 * it was stripped). The server re-applies the 2400 px cap, strips metadata and
 * writes the variants (lib/moments/process). Answers the new photo.
 */
export const runtime = 'nodejs';
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const g = await guardMomentsManager(sessionId);
  if (!g.ok) return g.res;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'invalid_form');
  }
  const file = form.get('file');
  if (!(file instanceof Blob) || file.size === 0) return fail(400, 'file_required');
  if (file.size > MAX_BYTES) return fail(413, 'file_too_large');
  const takenRaw = form.get('takenAt');
  const takenAt = typeof takenRaw === 'string' && !Number.isNaN(Date.parse(takenRaw)) ? new Date(takenRaw) : null;

  const id = randomUUID();
  const path = momentOriginalPath(sessionId, id);
  try {
    const processed = await processMoment(Buffer.from(await file.arrayBuffer()));
    await storeMoment(g.service, path, processed);
    const { error } = await g.service.from('session_media').insert({
      id,
      session_id: sessionId,
      uploader_id: g.user.id,
      storage_path: path,
      width: processed.width,
      height: processed.height,
      taken_at: (processed.takenAt ?? takenAt)?.toISOString() ?? null,
    });
    if (error) throw error;
    const urls = await signMoments(g.service, [path], 'grid');
    const item: MomentItem = {
      id,
      gridUrl: urls[path] ?? null,
      width: processed.width,
      height: processed.height,
      uploaderId: g.user.id,
      createdAt: new Date().toISOString(),
      tags: [],
    };
    return NextResponse.json(item, { status: 201, headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.upload', sessionId });
    return fail(/Input buffer|unsupported image/i.test(String(error)) ? 415 : 500, 'upload_failed');
  }
}
