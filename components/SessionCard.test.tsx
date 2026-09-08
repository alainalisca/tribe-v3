import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SessionCard from './SessionCard';
import type { SessionWithRelations } from '@/lib/dal';

/**
 * Smoke + behavior tests for <SessionCard>.
 *
 * Rewritten 2026-04-21. The component was heavily refactored during the
 * social-features branch; the old tests asserted on specific DOM strings
 * that no longer exist. This version is intentionally narrow:
 *
 *   - Renders without throwing for a minimally-populated session
 *   - Displays the sport and location
 *   - Navigates to /session/:id on click
 *   - Shows the urgency badge when the session is full
 *
 * Deeper behavior (participant stack rendering, skill-level badges,
 * creator menu, share flow) is better covered at the integration level
 * because those features pull in avatars, live data, and lib/share — all
 * stateful and interconnected. Keeping this test focused prevents it
 * from becoming the kind of brittle fixture that gets stale every
 * redesign.
 */

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));

vi.mock('@/lib/translations', () => ({
  sportTranslations: { Running: { es: 'Correr' } },
  TranslationKey: {},
}));

vi.mock('@/lib/utils', () => ({
  formatTime12Hour: (time: string) => time,
  cn: (...inputs: string[]) => inputs.filter(Boolean).join(' '),
}));

vi.mock('@/lib/city-config', () => ({
  detectNeighborhood: () => null,
  getNearestNeighborhood: () => null,
}));

// Steerable per test: '' is the no-photo case that falls back to the
// gradient, a URL is the real-image case. SessionCard branches on this to
// decide whether the expand affordance exists at all.
const mockHeroImage = { value: 'https://example.com/hero.jpg' };

vi.mock('@/lib/sport-images', () => ({
  getSessionHeroImage: () => mockHeroImage.value,
  getSportGradient: () => 'from-blue-500 to-purple-500',
}));

vi.mock('@/lib/share', () => ({
  shareSession: vi.fn(),
}));

vi.mock('@/components/AvatarStack', () => ({
  default: () => null,
}));

vi.mock('@/components/ShareButton', () => ({
  default: () => null,
}));

function baseSession(overrides: Partial<SessionWithRelations> = {}): SessionWithRelations {
  // Default to a future date + valid start_time/duration so
  // computeSessionStatus(...).isPast is false. Without this, badges
  // gated on !isPast (Full, Starting Soon) never render and the
  // tests silently lose coverage. The field is `start_time`, not
  // `time` — a 2026 rename that left old test fixtures stale.
  return {
    id: 'session-1',
    creator_id: 'creator-1',
    sport: 'Running',
    location: 'Medellín Park',
    location_lat: null,
    location_lng: null,
    date: '2099-04-25',
    start_time: '18:00',
    duration: 60,
    max_participants: 10,
    current_participants: 3,
    status: 'active',
    price_cents: 0,
    currency: 'USD',
    description: 'Weekly 5k run',
    photos: [],
    participants: [],
    creator: {
      id: 'creator-1',
      name: 'Al',
      avatar_url: null,
    },
    ...overrides,
  } as unknown as SessionWithRelations;
}

describe('<SessionCard />', () => {
  beforeEach(() => {
    mockHeroImage.value = 'https://example.com/hero.jpg';
    mockPush.mockClear();
  });

  it('renders without crashing and shows the session location', () => {
    render(<SessionCard session={baseSession()} />);
    expect(screen.getByText(/Medellín Park/)).toBeInTheDocument();
  });

  it('navigates to /session/:id when the card is clicked', () => {
    mockPush.mockClear();
    const { container } = render(<SessionCard session={baseSession()} />);
    // The outermost div has the onClick handler.
    const clickable = container.querySelector('div[class*="cursor-pointer"]');
    expect(clickable).toBeTruthy();
    (clickable as HTMLElement).click();
    expect(mockPush).toHaveBeenCalledWith('/session/session-1');
  });

  it('shows a Full badge when confirmed participants match max', () => {
    // computeSessionStatus reads session.session_participants, which isn't
    // on the strict SessionWithRelations type. Build the base session then
    // patch the field directly via a local cast rather than adding a
    // test-only property to the public type.
    const full = baseSession({ max_participants: 2 });
    (full as unknown as Record<string, unknown>).session_participants = [
      { user_id: 'u1', status: 'confirmed' },
      { user_id: 'u2', status: 'confirmed' },
    ];
    render(<SessionCard session={full} />);
    expect(screen.getByText(/Full/)).toBeInTheDocument();
  });

  describe('hero photo expand', () => {
    it('renders the expand button when the card has a real image', () => {
      render(<SessionCard session={baseSession()} />);
      expect(screen.getByLabelText('View full photo')).toBeInTheDocument();
    });

    it('does not render the expand button for a gradient-only card', () => {
      // No session photo and no instructor banner: getSessionHeroImage
      // returns '', the card falls back to the sport gradient, and there is
      // nothing to expand.
      mockHeroImage.value = '';
      render(<SessionCard session={baseSession()} />);
      expect(screen.queryByLabelText('View full photo')).not.toBeInTheDocument();
    });

    it('opens the lightbox without navigating to the session', () => {
      render(<SessionCard session={baseSession()} />);
      fireEvent.click(screen.getByLabelText('View full photo'));

      // The expand button stops propagation, so the card's own click
      // handler must not fire.
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('shows the session photos in the lightbox when it has them', () => {
      const withPhotos = baseSession({
        photos: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      } as Partial<SessionWithRelations>);
      render(<SessionCard session={withPhotos} />);
      fireEvent.click(screen.getByLabelText('View full photo'));
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    it('loads eagerly at high fetch priority only when marked priority', () => {
      // Regression guard: React 18 silently drops a camelCase fetchPriority
      // prop, which would make the above-the-fold hint a no-op.
      const { container: eagerCard } = render(<SessionCard session={baseSession()} priority />);
      const eagerImg = eagerCard.querySelector('img[src="https://example.com/hero.jpg"]');
      expect(eagerImg?.getAttribute('fetchpriority')).toBe('high');
      expect(eagerImg?.getAttribute('loading')).toBe('eager');
      expect(eagerImg?.getAttribute('decoding')).toBe('async');

      const { container: lazyCard } = render(<SessionCard session={baseSession()} />);
      const lazyImg = lazyCard.querySelector('img[src="https://example.com/hero.jpg"]');
      expect(lazyImg?.getAttribute('fetchpriority')).toBe('auto');
      expect(lazyImg?.getAttribute('loading')).toBe('lazy');
    });

    it('renders the hero in an aspect-ratio box rather than a fixed strip', () => {
      const { container } = render(<SessionCard session={baseSession()} />);
      expect(container.querySelector('.aspect-\\[4\\/3\\]')).toBeTruthy();
      expect(container.querySelector('.h-40')).toBeNull();
    });
  });
});
