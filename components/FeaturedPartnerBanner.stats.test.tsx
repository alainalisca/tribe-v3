/**
 * The featured-partner banner must not invent metrics (2026-09-12).
 *
 * This is the most-seen surface in the app and it is public. It rendered
 * partner.min_rating as "Rating" -- the contract minimum shown as a score, so a
 * gym with zero reviews was advertised to every athlete as rated 4 -- and
 * partner.min_sessions_per_month under a weekly label, which was the wrong
 * number and the wrong unit at once.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal/featuredPartners', async () => ({
  // Only the fetch is stubbed. partnerLogoUrl is the REAL implementation --
  // stubbing it would have meant testing the stub's idea of the fallback chain
  // rather than the chain itself, which is the whole point of these cases.
  ...(await vi.importActual<typeof import('@/lib/dal/featuredPartners')>('@/lib/dal/featuredPartners')),
  fetchActivePartners: async () => ({ success: true, data: partnersFixture }),
  incrementPartnerMetric: vi.fn(),
}));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/' }));

let partnersFixture: unknown[];

const PARTNER = {
  id: 'p1',
  user_id: 'gym-user',
  business_name: 'CrossFit BullBox',
  business_type: 'gym',
  description: null as string | null,
  description_es: null as string | null,
  logo_url: null,
  banner_url: null,
  specialties: ['CrossFit'],
  tier: 'standard',
  status: 'active',
  min_rating: 4,
  min_sessions_per_month: 4,
  total_bookings: 0,
  total_impressions: 0,
  total_clicks: 0,
  created_at: '2026-09-09T00:00:00Z',
  starts_at: '2026-09-09T00:00:00Z',
  display_order: 100,
  auto_approve_roster: true,
  user: null as { avatar_url: string | null } | null,
};

partnersFixture = [PARTNER];

import FeaturedPartnerBanner from './FeaturedPartnerBanner';

async function renderBanner() {
  const r = render(<FeaturedPartnerBanner />);
  await screen.findByText('CrossFit BullBox');
  return r;
}

describe('FeaturedPartnerBanner stats', () => {
  it('never shows a rating, because min_rating is a contract floor not a score', async () => {
    const { container } = await renderBanner();
    expect(screen.queryByText(/Rating/i)).toBeNull();
    // The value itself must not survive under a different label either.
    expect(container.textContent).not.toMatch(/\bRating\b/);
  });

  it('never shows sessions per week from the monthly contract minimum', async () => {
    await renderBanner();
    expect(screen.queryByText(/Sesiones\/sem/i)).toBeNull();
    expect(screen.queryByText(/Sessions\/wk/i)).toBeNull();
  });

  it('hides the athletes stat at zero rather than rendering "0"', async () => {
    await renderBanner();
    expect(screen.queryByText(/Atletas/i)).toBeNull();
  });

  it('shows the athletes stat when it is real', async () => {
    // The other half: without this the first three could pass by the banner
    // rendering nothing at all.
    PARTNER.total_bookings = 12;
    try {
      await renderBanner();
      expect(screen.getByText('Atletas')).toBeTruthy();
      expect(screen.getByText('12')).toBeTruthy();
    } finally {
      PARTNER.total_bookings = 0;
    }
  });
});

describe('FeaturedPartnerBanner redesign (T-GYM3)', () => {
  it('falls back to the account avatar rather than the monogram', async () => {
    // BullBox showed "CB" in the feed while the storefront and the discover
    // tile both showed its real logo, because the banner had no fallback.
    PARTNER.user = { avatar_url: 'https://cdn/avatar.jpg' };
    try {
      const { container } = await renderBanner();
      expect(container.querySelector('img')?.getAttribute('src')).toContain('avatar.jpg');
      expect(screen.queryByText('CB')).toBeNull();
    } finally {
      PARTNER.user = null;
    }
  });

  it('still shows the monogram when there is neither a logo nor an avatar', async () => {
    await renderBanner();
    expect(screen.getByText('CB')).toBeTruthy();
  });

  it('says "Ver gimnasio" for a gym, not "Ver Estudio"', async () => {
    await renderBanner();
    expect(screen.getByText(/Ver gimnasio/i)).toBeTruthy();
    expect(screen.queryByText(/Ver Estudio/i)).toBeNull();
  });

  it('says "Ver estudio" for a studio', async () => {
    // The other half: hardcoding either noun is the bug.
    PARTNER.business_type = 'studio';
    try {
      await renderBanner();
      expect(screen.getByText(/Ver estudio/i)).toBeTruthy();
    } finally {
      PARTNER.business_type = 'gym';
    }
  });

  it('matches the feed instead of inverting the surface', async () => {
    // A near-black gradient in a column of light cards read as pasted in from
    // another product.
    const { container } = await renderBanner();
    // Found by its own classes, not by position: the card is now nested inside
    // the scroll track rather than being the root node.
    const card = container.querySelector('.bg-theme-card') as HTMLElement;
    expect(card).toBeTruthy();
    expect(container.innerHTML).not.toContain('linear-gradient');
    // Featured status is still signalled, by the badge and a green border.
    expect(card.className).toContain('border-tribe-green');
  });

  it('trims a long description at a word boundary', async () => {
    PARTNER.description = 'A'.repeat(60) + ' boundary ' + 'B'.repeat(200);
    try {
      await renderBanner();
      const p = screen.getByText(/^A{60}/);
      expect(p.textContent?.endsWith('…')).toBe(true);
      // The cut must not land mid-word.
      expect(p.textContent).not.toMatch(/B+…$/);
    } finally {
      PARTNER.description = null;
    }
  });
});

describe('FeaturedPartnerBanner carousel affordances', () => {
  const TWO = [PARTNER, { ...PARTNER, id: 'p2', business_name: 'Marce Anahata', business_type: 'studio' }];

  async function renderTwo() {
    partnersFixture = TWO;
    try {
      const r = render(<FeaturedPartnerBanner />);
      await screen.findByText('CrossFit BullBox');
      return r;
    } finally {
      partnersFixture = [PARTNER];
    }
  }

  it('renders desktop arrows when there is more than one partner', async () => {
    await renderTwo();
    expect(screen.getByLabelText('Siguiente afiliado')).toBeTruthy();
    expect(screen.getByLabelText('Afiliado anterior')).toBeTruthy();
  });

  it('renders no arrows for a single partner', async () => {
    render(<FeaturedPartnerBanner />);
    await screen.findByText('CrossFit BullBox');
    expect(screen.queryByLabelText('Siguiente afiliado')).toBeNull();
  });

  it('gives every dot a 40px hit area, not a 6px one', async () => {
    // They were already <button>s, but 6px with no padding is not hittable on
    // a phone -- which is why they read as decoration.
    const { container } = await renderTwo();
    const dots = Array.from(container.querySelectorAll('button[aria-label^="Ir al afiliado"]'));
    expect(dots.length).toBe(2);
    for (const dot of dots) {
      expect(dot.className).toContain('min-w-[40px]');
      expect(dot.className).toContain('min-h-[40px]');
    }
  });

  it('marks the active dot for assistive tech', async () => {
    const { container } = await renderTwo();
    const current = container.querySelectorAll('button[aria-current="true"]');
    expect(current.length).toBe(1);
  });

  it('scrolls rather than swapping state, so touch swipe works natively', async () => {
    // The old version had no scroll container and no pointer handlers at all,
    // so there was nothing to swipe.
    const { container } = await renderTwo();
    const track = container.querySelector('.overflow-x-auto') as HTMLElement;
    expect(track).toBeTruthy();
    expect(track.className).toContain('snap-x');
  });

  it('does not auto-advance', () => {
    // ReducedMotionProvider exists in this app precisely to suppress motion
    // nobody asked for; a banner that rotates itself is that.
    //
    // Asserted against the SOURCE, not by spying on timers. Both timer
    // approaches caught the harness instead of the component -- fake timers
    // stalled the async render, and the spy picked up testing-library's own
    // waitFor timeout and real-timer check. A rotation would have to be a
    // setInterval or a delayed setTimeout in this file, so that is what the
    // test looks for.
    const src = readFileSync(join(__dirname, 'FeaturedPartnerBanner.tsx'), 'utf-8');
    expect(src).not.toMatch(/setInterval/);
    expect(src).not.toMatch(/setTimeout\s*\(/);
  });
});
