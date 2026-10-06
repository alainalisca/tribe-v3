/**
 * Plans the one-off move of recap photo files out of the public session-photos
 * bucket into the private session-recap-photos bucket (migration 199). Pure:
 * scripts/moveRecapPhotosToPrivateBucket.ts does the I/O.
 *
 * Measured 2026-10-04: 20 files in session-photos are named *-recap-*; 5 are
 * referenced by a session_recap_photos row (MOVE), 15 by none (ORPHAN: their
 * row was deleted, the file never was).
 */
import { RECAP_PHOTOS_BUCKET, storagePathFromUrl } from './privateMedia';

export const LEGACY_BUCKET = 'session-photos';

export interface RecapRowForMove {
  id: string;
  session_id: string | null;
  user_id: string | null;
  photo_url: string;
}

export interface RecapMove {
  rowId: string;
  fromPath: string;
  toPath: string;
  oldUrl: string;
  newUrl: string;
}

export interface RecapMovePlan {
  moves: RecapMove[];
  /** Recap-named files in session-photos that no row references. */
  orphans: string[];
  /** Rows that point into session-photos but cannot be moved, with the reason. */
  skipped: Array<{ rowId: string; reason: string }>;
}

/** A recap upload's file name, as both pre-199 uploaders wrote it. */
export function isRecapFileName(path: string): boolean {
  return /-recap-[^/]*$/.test(path);
}

export function planRecapMoves(
  supabaseUrl: string,
  rows: RecapRowForMove[],
  legacyObjectPaths: string[]
): RecapMovePlan {
  const base = supabaseUrl.replace(/\/+$/, '');
  const moves: RecapMove[] = [];
  const skipped: RecapMovePlan['skipped'] = [];
  const referenced = new Set<string>();

  for (const row of rows) {
    const fromPath = storagePathFromUrl(row.photo_url, LEGACY_BUCKET);
    if (!fromPath) continue; // already moved, or never in the legacy bucket
    referenced.add(fromPath);
    if (!row.session_id || !row.user_id) {
      skipped.push({ rowId: row.id, reason: 'row has no session_id or user_id, so it has no private folder' });
      continue;
    }
    const fileName = fromPath.split('/').pop() as string;
    const toPath = `${row.session_id}/${row.user_id}/${fileName}`;
    moves.push({
      rowId: row.id,
      fromPath,
      toPath,
      oldUrl: row.photo_url,
      newUrl: `${base}/storage/v1/object/public/${RECAP_PHOTOS_BUCKET}/${toPath}`,
    });
  }

  const orphans = legacyObjectPaths.filter((p) => isRecapFileName(p) && !referenced.has(p)).sort();
  return { moves, orphans, skipped };
}
