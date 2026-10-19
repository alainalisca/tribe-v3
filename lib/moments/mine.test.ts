import { describe, it, expect } from 'vitest';
import { fakeDb } from './testing/fakeDb';
import { groupMyMoments, loadMyMoments } from './mine';

/**
 * T-MOM1 Part C, spec tests: "owner-only visibility" and "a tagged user sees
 * only the photos they are in". Momentos reads by the signed-in user's own id
 * and reaches nothing else: not another person's tags, not an undelivered
 * tag, not a photo they removed themselves from, not a deleted photo, not the
 * other photos of the same session.
 */
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JUAN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function world() {
  const media = (id: string, session: string, taken: string, deleted: string | null = null) => ({
    id,
    session_id: session,
    storage_path: `${session}/${id}.jpg`,
    width: 10,
    height: 10,
    uploader_id: HOST,
    taken_at: taken,
    created_at: taken,
    deleted_at: deleted,
  });
  const tag = (media_id: string, user_id: string, o: Partial<Record<string, string | null>> = {}) => ({
    id: `t-${media_id}-${user_id}`,
    media_id,
    user_id,
    invite_id: null,
    delivered_at: '2026-10-10T00:00:00Z',
    removed_at: null,
    thanked_at: null,
    ...o,
  });
  return fakeDb({
    sessions: [
      { id: S1, title: null, sport: 'Boxing', date: '2026-10-07', start_time: '07:00', creator_id: HOST },
      { id: S2, title: 'Yoga al parque', sport: 'Yoga', date: '2026-10-14', start_time: '08:00', creator_id: HOST },
    ],
    users: [{ id: HOST, name: 'Salomon Tabares' }],
    session_media: [
      media('m1', S1, '2026-10-07T07:10:00Z'),
      media('m2', S1, '2026-10-07T07:05:00Z'),
      media('m3', S1, '2026-10-07T07:20:00Z'), // Juan only
      media('m4', S1, '2026-10-07T07:30:00Z'), // Ana, not delivered yet
      media('m5', S1, '2026-10-07T07:40:00Z'), // Ana removed herself
      media('m6', S1, '2026-10-07T07:50:00Z', '2026-10-11T00:00:00Z'), // deleted
      media('m7', S2, '2026-10-14T08:10:00Z'),
    ],
    session_media_tags: [
      tag('m1', ANA),
      tag('m2', ANA, { thanked_at: '2026-10-12T00:00:00Z' }),
      tag('m1', JUAN),
      tag('m3', JUAN),
      tag('m4', ANA, { delivered_at: null }),
      tag('m5', ANA, { removed_at: '2026-10-12T00:00:00Z' }),
      tag('m6', ANA),
      tag('m7', ANA),
    ],
  });
}

describe('Momentos: owner-only, only the photos they are in (T-MOM1 Part C)', () => {
  it("Ana sees her delivered photos only, by session, newest session first, in the order taken", async () => {
    const { client } = world();
    const batches = await loadMyMoments(client, ANA);
    expect(batches.map((b) => b.sessionId)).toEqual([S2, S1]);
    expect(batches[1].photos.map((p) => p.mediaId)).toEqual(['m2', 'm1']);
    expect(batches[1].photos.map((p) => p.thanked)).toEqual([true, false]);
    expect(batches[0].photos.map((p) => p.mediaId)).toEqual(['m7']);
    expect(batches[1].coachName).toBe('Salomon Tabares');
  });

  it("never a photo she is not in, even of the same session (Juan's m3), and nothing undelivered, removed or deleted", async () => {
    const { client } = world();
    const ids = (await loadMyMoments(client, ANA)).flatMap((b) => b.photos.map((p) => p.mediaId));
    for (const hidden of ['m3', 'm4', 'm5', 'm6']) expect(ids).not.toContain(hidden);
  });

  it("Juan's Momentos is his own: m1 and m3, never Ana's other photos", async () => {
    const { client } = world();
    const ids = (await loadMyMoments(client, JUAN)).flatMap((b) => b.photos.map((p) => p.mediaId));
    expect(ids.sort()).toEqual(['m1', 'm3']);
  });

  it('someone tagged in nothing sees nothing, and signs no URL', async () => {
    const { client, signed } = world();
    expect(await loadMyMoments(client, HOST)).toEqual([]);
    expect(signed).toEqual([]);
  });

  it('signs only the grid and viewer variants of her own photos', async () => {
    const { client, signed } = world();
    await loadMyMoments(client, ANA);
    expect(new Set(signed.map((f) => f.split('/')[1].split('.')[0]))).toEqual(new Set(['m1', 'm2', 'm7']));
    expect(signed.every((f) => /\.(1200|400)\.webp$/.test(f))).toBe(true);
  });

  it('groupMyMoments drops a media row that is not hers', () => {
    const out = groupMyMoments(
      [{ media_id: 'm1', thanked_at: null }],
      [
        { id: 'm1', session_id: S1, storage_path: 'a', width: 1, height: 1, taken_at: null, created_at: '1' },
        { id: 'mX', session_id: S1, storage_path: 'b', width: 1, height: 1, taken_at: null, created_at: '2' },
      ],
      [{ id: S1, title: null, sport: null, date: '2026-10-07', start_time: null, creator_id: null }],
      new Map(),
      {},
      {}
    );
    expect(out[0].photos.map((p) => p.mediaId)).toEqual(['m1']);
  });
});
