import { describe, it, expect } from 'vitest';
import { planRecapToMoments, type RecapRow } from './recapMigration';
import { RECAP_PHOTOS_BUCKET, storagePathFromUrl } from '@/lib/storage/privateMedia';

const S = 'cfcafad0-80ec-43ea-a018-eafcf99c8648';
const row = (id: string, url: string): RecapRow => ({
  id,
  session_id: S,
  user_id: 'u1',
  photo_url: url,
  uploaded_at: '2026-06-29T12:52:45Z',
});
const recapUrl = (p: string) => `https://x.supabase.co/storage/v1/object/public/${RECAP_PHOTOS_BUCKET}/${p}`;
const src = (u: string) => storagePathFromUrl(u, RECAP_PHOTOS_BUCKET);

describe('planRecapToMoments (T-MOM1)', () => {
  it('moves each recap photo to <session>/<same id>.jpg in moments', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const [m] = planRecapToMoments([row(id, recapUrl(`${S}/u1/a.jpg`))], new Set(), src);
    expect(m).toEqual(
      expect.objectContaining({ kind: 'move', sourcePath: `${S}/u1/a.jpg`, targetPath: `${S}/${id}.jpg` })
    );
  });

  it('skips what a previous run moved, and anything outside the recap bucket', () => {
    const a = '11111111-2222-4333-8444-555555555555';
    const b = '66666666-2222-4333-8444-555555555555';
    const plan = planRecapToMoments(
      [row(a, recapUrl(`${S}/u1/a.jpg`)), row(b, 'https://elsewhere.example/b.jpg')],
      new Set([a]),
      src
    );
    expect(plan.map((m) => (m.kind === 'skip' ? m.reason : m.kind))).toEqual(['already_moved', 'not_in_recap_bucket']);
  });
});
