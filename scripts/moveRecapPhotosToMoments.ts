/* eslint-disable no-console -- a CLI whose output is the report */
/**
 * T-MOM1: turns the recap photos ("Resumen de la Sesión") into Moments.
 * Run only AFTER migration 223 is applied (it creates session_media and the
 * private moments bucket).
 *
 *   npx tsx scripts/moveRecapPhotosToMoments.ts           # dry run: prints the plan, writes nothing
 *   npx tsx scripts/moveRecapPhotosToMoments.ts --apply   # copy, process, insert
 *
 * Per photo: download the recap file, process it like any upload (EXIF
 * applied and stripped, 2400 px cap, 1200 and 400 WebP variants), store it in
 * moments at <session>/<recap id>.jpg, insert session_media with the recap
 * row's id, uploader and upload time. UNTAGGED: only the uploader, the host
 * and admins see it. Re-running skips what is already moved (same id).
 *
 * Nothing is deleted: the recap rows and files stay until the recap upload is
 * retired (Part B) and Al decides. Reads NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY from the environment or .env.local; prints ids and
 * counts, never file contents, names or keys.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { RECAP_PHOTOS_BUCKET, storagePathFromUrl } from '../lib/storage/privateMedia';
import { MOMENTS_BUCKET } from '../lib/moments/paths';
import { processMoment } from '../lib/moments/process';
import { storeMoment } from '../lib/moments/storage';
import { planRecapToMoments, type RecapRow } from '../lib/moments/recapMigration';

function env(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  const file = path.resolve(__dirname, '..', '.env.local');
  if (existsSync(file)) {
    const line = readFileSync(file, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith(`${name}=`));
    if (line)
      return line
        .slice(line.indexOf('=') + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
  }
  throw new Error(`${name} is not set`);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  const { data: bucket } = await supabase.storage.getBucket(MOMENTS_BUCKET);
  if (apply && (!bucket || bucket.public)) throw new Error(`${MOMENTS_BUCKET} is missing or public. Apply 223 first.`);

  const { data: rows, error } = await supabase
    .from('session_recap_photos')
    .select('id, session_id, user_id, photo_url, uploaded_at')
    .order('uploaded_at', { ascending: true });
  if (error) throw error;

  let moved = new Set<string>();
  if (bucket) {
    const ids = (rows ?? []).map((r) => r.id);
    const { data: existing, error: e2 } = await supabase.from('session_media').select('id').in('id', ids);
    if (e2) throw e2;
    moved = new Set((existing ?? []).map((r: { id: string }) => r.id));
  }

  const plan = planRecapToMoments((rows ?? []) as RecapRow[], moved, (u) => storagePathFromUrl(u, RECAP_PHOTOS_BUCKET));
  console.log(`recap photos: ${plan.length}; to move: ${plan.filter((p) => p.kind === 'move').length}`);
  for (const p of plan)
    console.log(
      `  ${p.kind === 'move' ? 'MOVE' : `SKIP (${p.reason})`}  ${p.row.id}  session ${p.row.session_id.slice(0, 8)}`
    );
  if (!apply) {
    console.log('\nDry run: nothing written. Re-run with --apply after 223 is applied.');
    return;
  }

  let done = 0;
  for (const p of plan) {
    if (p.kind !== 'move') continue;
    const { data: file, error: dl } = await supabase.storage.from(RECAP_PHOTOS_BUCKET).download(p.sourcePath);
    if (dl || !file) {
      console.log(`  FAILED download ${p.row.id}: ${dl?.message ?? 'empty'}`);
      continue;
    }
    const processed = await processMoment(Buffer.from(await file.arrayBuffer()));
    await storeMoment(supabase, p.targetPath, processed);
    const { error: ins } = await supabase.from('session_media').insert({
      id: p.row.id,
      session_id: p.row.session_id,
      uploader_id: p.row.user_id,
      storage_path: p.targetPath,
      width: processed.width,
      height: processed.height,
      taken_at: (processed.takenAt ?? (p.row.uploaded_at ? new Date(p.row.uploaded_at) : null))?.toISOString() ?? null,
      created_at: p.row.uploaded_at ?? new Date().toISOString(),
    });
    if (ins) {
      console.log(`  FAILED insert ${p.row.id}: ${ins.message} (files stored; re-run after fixing)`);
      continue;
    }
    done++;
    console.log(`  moved ${p.row.id}  ${processed.width}x${processed.height}`);
  }
  console.log(`\nMoved ${done}. Recap rows and files untouched.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
