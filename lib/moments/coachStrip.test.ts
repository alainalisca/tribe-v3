import { describe, it, expect } from 'vitest';
import { fakeDb } from './testing/fakeDb';
import { loadCoachStrip, planCoachStrip, STRIP_MAX } from './coachStrip';

/**
 * T-MOM1 Part D, spec tests: the coach strip is hidden below the density rule
 * (3 photos from 2 people), and a removed tag drops the photo from it.
 */
const row = (mediaId: string, userId: string, when: string) => ({ mediaId, userId, when });

describe('the coach strip density rule (T-MOM1 Part D)', () => {
  it('hidden below 3 photos or below 2 people', () => {
    expect(planCoachStrip([])).toBeNull();
    expect(planCoachStrip([row('m1', 'a', '1'), row('m2', 'b', '2')])).toBeNull();
    expect(planCoachStrip([row('m1', 'a', '1'), row('m2', 'a', '2'), row('m3', 'a', '3')])).toBeNull();
    // Two people on one photo still make one photo.
    expect(planCoachStrip([row('m1', 'a', '1'), row('m1', 'b', '1'), row('m2', 'a', '2')])).toBeNull();
  });

  it('shown at 3 photos from 2 people, newest first, 12 at most', () => {
    expect(planCoachStrip([row('m1', 'a', '1'), row('m2', 'b', '3'), row('m3', 'a', '2')])).toEqual(['m2', 'm3', 'm1']);
    const many = Array.from({ length: 15 }, (_, i) => row(`m${i}`, i % 2 ? 'a' : 'b', String(i).padStart(2, '0')));
    const plan = planCoachStrip(many)!;
    expect(plan).toHaveLength(STRIP_MAX);
    expect(plan[0]).toBe('m14');
  });
});

describe('loadCoachStrip (T-MOM1 Part D)', () => {
  const COACH = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  function world(o: { removeOne?: boolean } = {}) {
    const media = (id: string, session: string, taken: string, deleted: string | null = null) => ({
      id,
      session_id: session,
      storage_path: `${session}/${id}.jpg`,
      taken_at: taken,
      created_at: taken,
      deleted_at: deleted,
    });
    const tag = (media_id: string, user_id: string, extra: Record<string, unknown> = {}) => ({
      id: `t-${media_id}-${user_id}`,
      media_id,
      user_id,
      invite_id: null,
      delivered_at: '2026-10-10',
      removed_at: null,
      show_on_coach_page: true,
      ...extra,
    });
    return fakeDb({
      sessions: [
        { id: 's1', title: null, sport: 'Boxing', date: '2026-10-18', creator_id: COACH, is_test: false },
        { id: 'st', title: 'Prueba', sport: 'Boxing', date: '2026-10-19', creator_id: COACH, is_test: true },
        { id: 'sx', title: null, sport: 'Yoga', date: '2026-10-18', creator_id: 'other', is_test: false },
      ],
      session_media: [
        media('m1', 's1', '2026-10-18T07:01:00Z'),
        media('m2', 's1', '2026-10-18T07:02:00Z'),
        media('m3', 's1', '2026-10-18T07:03:00Z'),
        media('m4', 's1', '2026-10-18T07:04:00Z', '2026-10-19'), // deleted
        media('mt', 'st', '2026-10-19T07:00:00Z'), // test session
        media('mx', 'sx', '2026-10-18T07:00:00Z'), // another coach's session
      ],
      session_media_tags: [
        tag('m1', 'ana'),
        tag('m2', 'juan'),
        tag('m3', 'ana', o.removeOne ? { removed_at: '2026-10-19' } : {}),
        tag('m3', 'vale', { show_on_coach_page: false }),
        tag('m2', 'banned'),
        tag('m4', 'ana'),
        tag('mt', 'ana'),
        tag('mx', 'ana'),
        tag('m1', 'undelivered', { delivered_at: null }),
      ],
      users: [
        { id: 'ana', is_test_account: false, banned: false, deleted_at: null },
        { id: 'juan', is_test_account: false, banned: false, deleted_at: null },
        { id: 'vale', is_test_account: false, banned: false, deleted_at: null },
        { id: 'banned', is_test_account: false, banned: true, deleted_at: null },
        { id: 'undelivered', is_test_account: false, banned: false, deleted_at: null },
      ],
    });
  }

  it("only the coach's own, live, opted-in photos: m3, m2, m1 newest first, with captions", async () => {
    const { client } = world();
    const strip = await loadCoachStrip(client, COACH, 'es');
    expect(strip!.map((t) => t.mediaId)).toEqual(['m3', 'm2', 'm1']);
    expect(strip![0].caption).toBe('Boxeo · 18 oct');
    expect(strip![0].viewerUrl).toBe('signed:s1/m3.jpg.1200.webp');
  });

  it('a removed tag drops the photo at once, and the strip with it when it falls below the rule', async () => {
    const { client } = world({ removeOne: true });
    expect(await loadCoachStrip(client, COACH, 'es')).toBeNull();
  });

  it('a coach with no sessions has no strip', async () => {
    const { client } = world();
    expect(await loadCoachStrip(client, 'nobody', 'es')).toBeNull();
  });
});
