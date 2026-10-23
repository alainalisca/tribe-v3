import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

/** One canned answer per table; every query builder method chains, awaiting resolves it. */
const answers: Record<string, { data: unknown; error: unknown }> = {};
const calls: Array<{ table: string; filters: string[] }> = [];
function builder(table: string) {
  const call = { table, filters: [] as string[] };
  calls.push(call);
  const result = () => answers[table] ?? { data: null, error: null };
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'in']) {
    b[m] = (...args: unknown[]) => {
      call.filters.push(`${m}:${args.map(String).join(',')}`);
      return b;
    };
  }
  b.maybeSingle = async () => {
    const r = result();
    return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
  };
  b.then = (resolve: (v: unknown) => unknown) => resolve(result());
  return b;
}
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({ from: (t: string) => builder(t) }) }));

import { fetchCoachExtras, fetchGymExtras, fetchPublicReviews } from './publicProfileData';

const REVIEWER_ID = '9f1e2d3c-0000-4000-8000-000000000001';
const REVIEW_ID = 'aa11bb22-0000-4000-8000-000000000002';
const visible = { is_test_account: false, banned: false, deleted_at: null };
const review = (rating: number, name: string | null, over: object = {}) => ({
  id: REVIEW_ID,
  reviewer_id: REVIEWER_ID,
  rating,
  comment: `Muy buena clase ${rating}`,
  created_at: '2026-10-10T12:00:00Z',
  reviewer: { id: REVIEWER_ID, name, avatar_url: 'https://x/avatar.jpg', ...visible, ...over },
});

beforeEach(() => {
  for (const k of Object.keys(answers)) delete answers[k];
  calls.length = 0;
});

describe('reviews for a public page', () => {
  it('carry only a rating, a comment, a date and "First L." -- no ids, no full names, no avatars', async () => {
    answers.reviews = { data: [review(5, 'María José Gómez'), review(4, 'Ana Pérez'), review(5, 'Luis')], error: null };
    const out = await fetchPublicReviews('coach-1', 'Atleta');
    expect(out.items.map((r) => r.reviewer)).toEqual(['María G.', 'Ana P.', 'Luis']);
    const json = JSON.stringify(out);
    for (const leak of [REVIEWER_ID, REVIEW_ID, 'Gómez', 'Pérez', 'José', 'avatar', 'reviewer_id']) {
      expect(json).not.toContain(leak);
    }
    expect(Object.keys(out.items[0]).sort()).toEqual(['comment', 'createdAt', 'rating', 'reviewer']);
  });

  it('leave out reviewers who are test or banned accounts', async () => {
    answers.reviews = {
      data: [
        review(5, 'Visible Uno'),
        review(1, 'Prueba Test', { is_test_account: true }),
        review(1, 'Baneado X', { banned: true }),
      ],
      error: null,
    };
    const out = await fetchPublicReviews('coach-1', 'Atleta');
    expect(out.count).toBe(1);
    expect(out.items.map((r) => r.reviewer)).toEqual(['Visible U.']);
  });

  it("T-DEL1: keep a deleted account's review, stars and text, under the deleted label and never the name", async () => {
    answers.reviews = {
      data: [review(4, 'Borrado Ybarra', { deleted_at: '2026-10-23' }), review(5, 'Visible Uno')],
      error: null,
    };
    const out = await fetchPublicReviews('coach-1', 'Atleta', 'Usuario eliminado');
    expect(out.count).toBe(2);
    expect(out.items.map((r) => [r.reviewer, r.rating])).toEqual([
      ['Usuario eliminado', 4],
      ['Visible U.', 5],
    ]);
    expect(JSON.stringify(out)).not.toMatch(/Borrado|Ybarra/);
  });

  it('show no star average below 3 reviews, and the average from 3', async () => {
    answers.reviews = { data: [review(5, 'A B'), review(4, 'C D')], error: null };
    expect((await fetchPublicReviews('c', 'Atleta')).rating).toBeNull();
    answers.reviews = { data: [review(5, 'A B'), review(4, 'C D'), review(4, 'E F')], error: null };
    const three = await fetchPublicReviews('c', 'Atleta');
    expect(three.count).toBe(3);
    expect(three.rating).toBe(4.3);
  });

  it('fail soft: an error is no reviews, never a throw', async () => {
    answers.reviews = { data: null, error: { message: 'boom' } };
    expect(await fetchPublicReviews('c', 'Atleta')).toEqual({ items: [], count: 0, rating: null });
  });
});

describe("a coach's extras", () => {
  it('bring the tagline, the credentials, the video, and the pass only when it is on', async () => {
    answers.users = {
      data: {
        storefront_tagline: '  Boxeo para todos ',
        certifications: ['AIBA Nivel 1', ' '],
        is_verified_instructor: true,
        storefront_video_url: 'abc123',
        cover_image_url: 'https://x/cover.jpg',
      },
      error: null,
    };
    answers.featured_partners = {
      data: [{ slug: 'salo-boxeo', business_name: 'Salo Boxeo', pass_active: true }],
      error: null,
    };
    answers.reviews = { data: [], error: null };
    const out = await fetchCoachExtras('coach-1', 'Atleta');
    expect(out).toMatchObject({
      tagline: 'Boxeo para todos',
      certifications: ['AIBA Nivel 1'],
      verified: true,
      videoUrl: 'abc123',
      pass: { slug: 'salo-boxeo', partnerName: 'Salo Boxeo' },
    });
    // Only an independent coach's own active pass: a gym's pass belongs on /g.
    const passQuery = calls.find((c) => c.table === 'featured_partners')!;
    expect(passQuery.filters).toEqual(
      expect.arrayContaining([
        'eq:user_id,coach-1',
        'eq:business_type,independent',
        'eq:pass_active,true',
        'eq:status,active',
      ])
    );
  });

  it('have no pass when none is on', async () => {
    answers.users = { data: {}, error: null };
    answers.featured_partners = { data: [], error: null };
    answers.reviews = { data: [], error: null };
    expect((await fetchCoachExtras('coach-1', 'Atleta')).pass).toBeNull();
  });
});

describe("a gym's extras", () => {
  it('read pass_active from featured_partners, not partners_public', async () => {
    answers.featured_partners = {
      data: { user_id: 'owner-1', slug: 'bullbox', business_name: 'BullBox', pass_active: true },
      error: null,
    };
    answers.partner_instructors = { data: [], error: null };
    const out = await fetchGymExtras('partner-1');
    expect(out.ownerId).toBe('owner-1');
    expect(out.pass).toEqual({ slug: 'bullbox', partnerName: 'BullBox' });
    expect(calls.map((c) => c.table)).not.toContain('partners_public');
  });

  it('list only coaches whose own page exists (instructors, visible)', async () => {
    answers.featured_partners = {
      data: { user_id: 'o', slug: 'g', business_name: 'G', pass_active: false },
      error: null,
    };
    const coach = (id: string, over: object = {}) => ({
      instructor_id: id,
      user: { id, name: `Coach ${id}`, avatar_url: null, is_instructor: true, ...visible, ...over },
    });
    answers.partner_instructors = {
      data: [
        coach('a'),
        coach('b', { is_instructor: false }),
        coach('c', { is_test_account: true }),
        coach('d', { banned: true }),
      ],
      error: null,
    };
    const out = await fetchGymExtras('partner-1');
    expect(out.pass).toBeNull();
    expect(out.roster).toEqual([{ id: 'a', name: 'Coach a', avatarUrl: null }]);
  });
});
