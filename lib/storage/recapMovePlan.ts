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
  /**
   * Public copies left behind by rows ALREADY moved (a run with --apply but
   * without --remove-old). Not orphans: a row still owns their content, in the
   * private bucket. Found 2026-10-05: the first production run moved 5 rows and
   * kept the old copies, and the next run classed those 5 as orphans.
   */
  leftovers: Array<{ legacyPath: string; privatePath: string }>;
  /** Recap-named files in session-photos that no row references, moved or not. */
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
  const leftovers: RecapMovePlan['leftovers'] = [];
  const legacy = new Set(legacyObjectPaths);

  for (const row of rows) {
    const movedPath = storagePathFromUrl(row.photo_url, RECAP_PHOTOS_BUCKET);
    if (movedPath) {
      // <session>/<uploader>/<file> was <uploader>/<file> in the legacy bucket.
      const [, uploader, file] = movedPath.split('/');
      const legacyPath = `${uploader}/${file}`;
      if (uploader && file && legacy.has(legacyPath)) {
        referenced.add(legacyPath);
        leftovers.push({ legacyPath, privatePath: movedPath });
      }
      continue;
    }
    const fromPath = storagePathFromUrl(row.photo_url, LEGACY_BUCKET);
    if (!fromPath) continue; // never in the legacy bucket
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
  return { moves, leftovers, orphans, skipped };
}
