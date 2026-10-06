/* eslint-disable no-console -- a CLI whose output is the report */
/**
 * Moves recap photo files from the PUBLIC session-photos bucket into the
 * PRIVATE session-recap-photos bucket, and points each row at its new file.
 * Run only AFTER migration 199 is applied (it creates the bucket).
 *
 *   npx tsx scripts/moveRecapPhotosToPrivateBucket.ts                  # dry run: prints the plan, writes nothing
 *   npx tsx scripts/moveRecapPhotosToPrivateBucket.ts --apply          # copy files, repoint rows
 *   npx tsx scripts/moveRecapPhotosToPrivateBucket.ts --apply --remove-old      # also delete the old public copies
 *   npx tsx scripts/moveRecapPhotosToPrivateBucket.ts --delete-orphans # delete recap files no row references
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
 * environment or .env.local. Prints counts and row ids, never file contents,
 * user names or keys.
 *
 * Order per row, so a failure part way leaves nothing broken:
 *   1. copy the bytes to the new path (skipped if a file is already there),
 *   2. read the new file back and compare its size,
 *   3. repoint the row, guarded on its photo_url still being the old URL,
 *   4. only with --remove-old, delete the old public copy.
 * Re-running is safe: moved rows no longer point into session-photos and drop
 * out of the plan.
 *
 * --remove-old and --delete-orphans DELETE FILES PERMANENTLY. Al decides
 * whether and when; the dry run lists what they would remove.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { planRecapMoves, LEGACY_BUCKET, type RecapRowForMove } from '../lib/storage/recapMovePlan';
import { RECAP_PHOTOS_BUCKET } from '../lib/storage/privateMedia';

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

async function listLegacyPaths(supabase: SupabaseClient): Promise<string[]> {
  const out: string[] = [];
  const { data: top, error } = await supabase.storage.from(LEGACY_BUCKET).list('', { limit: 1000 });
  if (error) throw error;
  for (const folder of top ?? []) {
    if (folder.id) continue; // a file at the root; recap files always sit in a folder
    const { data: files, error: e2 } = await supabase.storage.from(LEGACY_BUCKET).list(folder.name, { limit: 1000 });
    if (e2) throw e2;
    for (const f of files ?? []) if (f.id) out.push(`${folder.name}/${f.name}`);
  }
  return out;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const removeOld = args.has('--remove-old');
  const deleteOrphans = args.has('--delete-orphans');
  if (removeOld && !apply) throw new Error('--remove-old only makes sense with --apply');

  const url = env('NEXT_PUBLIC_SUPABASE_URL');
  const supabase = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  // A dry run may preview before 199 is applied; anything that writes may not.
  const { data: bucket } = await supabase.storage.getBucket(RECAP_PHOTOS_BUCKET);
  if ((apply || deleteOrphans) && (!bucket || bucket.public)) {
    throw new Error(`${RECAP_PHOTOS_BUCKET} is missing or public. Apply migration 199 first.`);
  }

  const { data: rows, error } = await supabase
    .from('session_recap_photos')
    .select('id, session_id, user_id, photo_url');
  if (error) throw error;
  const legacy = await listLegacyPaths(supabase);
  const plan = planRecapMoves(url, (rows ?? []) as RecapRowForMove[], legacy);

  console.log(
    `plan: ${plan.moves.length} to move, ${plan.orphans.length} orphaned recap file(s), ${plan.skipped.length} skipped`
  );
  for (const s of plan.skipped) console.log(`  skip row ${s.rowId}: ${s.reason}`);

  if (!apply && !deleteOrphans) {
    console.log('dry run: nothing written. Add --apply to move.');
    return;
  }

  let moved = 0;
  if (apply) {
    for (const m of plan.moves) {
      const { data: blob, error: dlErr } = await supabase.storage.from(LEGACY_BUCKET).download(m.fromPath);
      if (dlErr || !blob) throw new Error(`row ${m.rowId}: download failed: ${dlErr?.message}`);

      const { data: existing } = await supabase.storage.from(RECAP_PHOTOS_BUCKET).download(m.toPath);
      if (!existing) {
        const { error: upErr } = await supabase.storage
          .from(RECAP_PHOTOS_BUCKET)
          .upload(m.toPath, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
        if (upErr) throw new Error(`row ${m.rowId}: upload failed: ${upErr.message}`);
      }

      const { data: check } = await supabase.storage.from(RECAP_PHOTOS_BUCKET).download(m.toPath);
      if (!check || check.size !== blob.size) {
        throw new Error(`row ${m.rowId}: the new copy does not read back at the same size; row NOT repointed`);
      }

      const { data: updated, error: upRowErr } = await supabase
        .from('session_recap_photos')
        .update({ photo_url: m.newUrl })
        .eq('id', m.rowId)
        .eq('photo_url', m.oldUrl)
        .select('id');
      if (upRowErr) throw new Error(`row ${m.rowId}: repoint failed: ${upRowErr.message}`);
      if ((updated ?? []).length !== 1) {
        console.log(`  row ${m.rowId}: photo_url changed since planning; left as is`);
        continue;
      }

      if (removeOld) {
        const { error: rmErr } = await supabase.storage.from(LEGACY_BUCKET).remove([m.fromPath]);
        if (rmErr) throw new Error(`row ${m.rowId}: moved, but removing the old copy failed: ${rmErr.message}`);
      }
      moved++;
    }
    console.log(`moved ${moved} of ${plan.moves.length}${removeOld ? ', old copies removed' : ', old copies kept'}`);
  }

  if (deleteOrphans && plan.orphans.length > 0) {
    const { error: rmErr } = await supabase.storage.from(LEGACY_BUCKET).remove(plan.orphans);
    if (rmErr) throw new Error(`deleting orphans failed: ${rmErr.message}`);
    console.log(`deleted ${plan.orphans.length} orphaned recap file(s)`);
  }
}

main().catch((err: unknown) => {
  console.error(`moveRecapPhotosToPrivateBucket FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
