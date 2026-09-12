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
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal/featuredPartners', () => ({
  fetchActivePartners: async () => ({ success: true, data: [PARTNER] }),
  incrementPartnerMetric: vi.fn(),
}));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/' }));

const PARTNER = {
  id: 'p1',
  user_id: 'gym-user',
  business_name: 'CrossFit BullBox',
  business_type: 'gym',
  description: null,
  description_es: null,
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
};

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
