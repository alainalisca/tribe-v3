import { momentOriginalPath } from './paths';

/**
 * T-MOM1: the recap photos ("Resumen de la Sesión") become Moments. Each one
 * keeps its id (session_media.id = session_recap_photos.id), so a re-run sees
 * what is already moved and skips it. They arrive UNTAGGED: visible to their
 * uploader and the session's host (and admins) only, never delivered to
 * anyone, which is narrower than the recap rule (every confirmed participant)
 * they had. Nothing is deleted from the recap table or bucket here.
 */
export type RecapRow = {
  id: string;
  session_id: string;
  user_id: string;
  photo_url: string;
  uploaded_at: string | null;
};

export type RecapMove =
  | { kind: 'move'; row: RecapRow; sourcePath: string; targetPath: string }
  | { kind: 'skip'; row: RecapRow; reason: 'already_moved' | 'not_in_recap_bucket' };

export function planRecapToMoments(
  rows: RecapRow[],
  movedIds: Set<string>,
  sourcePathOf: (url: string) => string | null
): RecapMove[] {
  return rows.map((row) => {
    if (movedIds.has(row.id)) return { kind: 'skip', row, reason: 'already_moved' };
    const sourcePath = sourcePathOf(row.photo_url);
    if (!sourcePath) return { kind: 'skip', row, reason: 'not_in_recap_bucket' };
    return { kind: 'move', row, sourcePath, targetPath: momentOriginalPath(row.session_id, row.id) };
  });
}
