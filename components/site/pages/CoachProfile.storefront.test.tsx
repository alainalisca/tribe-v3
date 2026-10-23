import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

/**
 * T-POLISH1 PR 3b-1: what /i brings over from the storefront, asserted on the
 * server-rendered HTML a visitor (and a scraper) receives.
 */
vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
// The island never learns who is viewing during a server render.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: () => new Promise(() => {}) } }),
}));
vi.mock('@/components/instructor/VideoIntro', () => ({
  default: ({ videoUrl }: { videoUrl: string }) => <div data-testid="video" data-src={videoUrl} />,
}));

const REVIEWER_ID = '9f1e2d3c-0000-4000-8000-0000000000aa';
const REVIEW_ID = 'aa11bb22-0000-4000-8000-0000000000bb';
let reviewRows: unknown[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  getServiceRoleClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit']) b[m] = () => b;
      b.then = (resolve: (v: unknown) => unknown) => resolve({ data: reviewRows, error: null });
      return b;
    },
  }),
}));

import CoachProfile from './CoachProfile';
import { fetchPublicReviews, type CoachExtras } from '@/lib/site/publicProfileData';

const COACH = '11111111-1111-4111-8111-111111111111';
const row = (rating: number, name: string) => ({
  id: REVIEW_ID,
  reviewer_id: REVIEWER_ID,
  rating,
  comment: `Gran clase (${rating})`,
  created_at: '2026-10-10T12:00:00Z',
  reviewer: {
    id: REVIEWER_ID,
    name,
    avatar_url: 'https://x/a.jpg',
    is_test_account: false,
    banned: false,
    deleted_at: null,
  },
});

async function page(reviews: unknown[], over: Partial<CoachExtras> = {}) {
  reviewRows = reviews;
  const extras: CoachExtras = {
    tagline: 'Boxeo para todos',
    certifications: ['AIBA Nivel 1'],
    verified: true,
    videoUrl: 'stream-uid-1',
    videoPoster: null,
    reviews: await fetchPublicReviews(COACH, 'Atleta'),
    pass: null,
    ...over,
  };
  return renderToString(
    <CoachProfile
      lang="es"
      coach={{ name: 'Salomon Tabares', sports: ['Boxing'], bio: 'Boxeo en Medellín.', specialties: ['Boxeo'] }}
      gym={null}
      photo={null}
      sessions={[]}
      weekEnd="2026-10-23"
      coachId={COACH}
      pagePath="/i/salotaba/"
      extras={extras}
    />
  );
}

describe('reviews in the page HTML', () => {
  it('show "First L." and never a full name, a reviewer id, a review id or an avatar', async () => {
    const html = await page([row(5, 'María José Gómez'), row(4, 'Ana Pérez')]);
    expect(html).toContain('María G.');
    expect(html).toContain('Ana P.');
    for (const leak of ['Gómez', 'José', 'Pérez', REVIEWER_ID, REVIEW_ID, 'https://x/a.jpg']) {
      expect(html).not.toContain(leak);
    }
  });

  it('below 3 reviews: the reviews, no stars and no average', async () => {
    const html = await page([row(5, 'Ana Pérez'), row(4, 'Luis Gil')]);
    expect(html).toContain('Gran clase (5)');
    expect(html).toContain('2 reseñas');
    expect(html).not.toContain('★');
    expect(html).not.toContain('de 5');
  });

  it('from 3 reviews: the average and the stars', async () => {
    const html = await page([row(5, 'Ana Pérez'), row(4, 'Luis Gil'), row(5, 'Eva Ríos')]);
    expect(html).toContain('4.7');
    expect(html).toContain('de 5');
    expect(html).toContain('★');
    expect(html).toContain('3 reseñas');
  });

  it('no reviews section at all with none', async () => {
    expect(await page([])).not.toContain('coach-reviews');
  });
});

describe('the rest of the storefront on /i', () => {
  it('tagline, credentials and the video', async () => {
    const html = await page([]);
    expect(html).toContain('Boxeo para todos');
    expect(html).toContain('Credenciales');
    expect(html).toContain('Coach verificado');
    expect(html).toContain('AIBA Nivel 1');
    expect(html).toContain('data-src="stream-uid-1"');
  });

  it('the actions as signed-out sign-in links, in the server HTML everyone gets', async () => {
    const html = (await page([])).replace(/\/\?/g, '?');
    expect(html).toContain('data-viewer="out"');
    expect(html).toContain(`/auth?returnTo=${encodeURIComponent(`/messages/?user=${COACH}`)}`);
    expect(html).toContain('Estoy interesado');
    expect(html).not.toContain('Bloquear');
  });

  it("an independent coach's pass, as the plain link (no src=app)", async () => {
    const html = await page([], { pass: { slug: 'salo-boxeo', partnerName: 'Salo Boxeo' } });
    // next/link drops the trailing slash under vitest (no next.config); the app keeps it.
    expect(html).toMatch(/href="\/pase\/salo-boxeo\/?"/);
    expect(html).toContain('Primera clase gratis');
    expect(html).not.toContain('src=app');
  });

  it('no pass link without a pass', async () => {
    expect(await page([])).not.toContain('/pase/');
  });
});
