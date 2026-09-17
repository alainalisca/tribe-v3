import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
  sportTranslations: { Running: { en: 'Running', es: 'Correr' } },
  translateSport: (sport: string) => sport,
  TranslationKey: {},
}));

vi.mock('@/lib/utils', () => ({
  formatTime12Hour: (time: string) => time,
  cn: (...inputs: string[]) => inputs.filter(Boolean).join(' '),
}));

// Keep the real config (formatSessionLocationShort reads ACTIVE_CITY for the
// city/department/country it strips) and stub only the coord lookups.
vi.mock('@/lib/city-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/city-config')>()),
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

  it('links to the session with a real anchor, not an onClick div', () => {
    const { container } = render(<SessionCard session={baseSession()} />);
    const link = container.querySelector('a[href="/session/session-1"]');
    expect(link).toBeTruthy();
    // The old div[onClick] gave no keyboard access, no middle-click and no
    // open-in-new-tab. Nothing should have reintroduced it.
    expect(container.querySelector('div[class*="cursor-pointer"]')).toBeNull();
  });

  /**
   * The Full badge is driven by sessions.current_participants, NOT by the
   * participants array. That is a deliberate decision, and these tests exist to
   * hold it in place.
   *
   * WHAT WAS HERE BEFORE, and why it proved nothing. The old test was named
   * "shows a Full badge when confirmed participants match max" and set
   * `session_participants` on the fixture through a cast. computeSessionStatus
   * has never read `session_participants` -- it reads `session.participants` --
   * so that line was dead. The assertion passed anyway because baseSession sets
   * current_participants: 3 while the test overrode max_participants: 2, which
   * makes isFull true no matter what the fixture array contains. A check that
   * passed without the scenario it names ever being reproduced.
   *
   * WHY isFull READS THE COUNTER AND SHOULD KEEP DOING SO. fetchUpcomingSessions
   * (lib/dal/sessions.ts:415) returns every session with `participants: []` --
   * the array is simply not populated on that feed path. An isFull computed from
   * the array would report every session on the main feed as never full, on a
   * surface where "Full" is the whole point of the badge. The counter is
   * maintained in the database by trg_sync_session_participant_count (087) and
   * is always present, so it is the only source that works everywhere.
   *
   * KNOWN AND OUT OF SCOPE HERE: spotsLeft and fillingFast in SessionCard read
   * confirmedParticipants.length (the array) while isFull reads the counter, so
   * on the fetchUpcomingSessions path a session can hold current_participants: 9
   * and still compute spotsLeft: 10. Unifying those two sources is its own
   * ticket and is blocked on migration 169; these tests deliberately do not
   * assert on spotsLeft, so they will not have to change when it lands.
   */
  describe('Full badge', () => {
    /**
     * A roster that agrees with the counter, so these two tests are full under
     * EITHER implementation. That is the point: it leaves the empty-array test
     * below as the only one that can tell the counter and the array apart. With
     * baseSession's default `participants: []` all three would have failed
     * together the moment isFull switched source, and none of them would have
     * been isolating anything.
     */
    const athletes = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        user_id: `athlete-${i}`,
        status: 'confirmed',
        is_guest: false,
        guest_name: null,
        user: { id: `athlete-${i}`, name: `Athlete ${i}`, avatar_url: null },
      }));

    it('shows when the participant counter reaches max', () => {
      render(
        <SessionCard
          session={baseSession({
            max_participants: 2,
            current_participants: 2,
            participants: athletes(2),
          } as Partial<SessionWithRelations>)}
        />
      );
      expect(screen.getByText('Full')).toBeInTheDocument();
    });

    it('shows when the counter has somehow exceeded max', () => {
      render(
        <SessionCard
          session={baseSession({
            max_participants: 2,
            current_participants: 5,
            participants: athletes(3),
          } as Partial<SessionWithRelations>)}
        />
      );
      expect(screen.getByText('Full')).toBeInTheDocument();
    });

    // The negative half. Without this the positive assertions above would pass
    // against an isFull hardcoded to true, which is exactly the failure the old
    // test had: an outcome that did not depend on the setup.
    it('does NOT show when the counter is below max', () => {
      render(<SessionCard session={baseSession({ max_participants: 10, current_participants: 9 })} />);
      expect(screen.queryByText('Full')).toBeNull();
    });

    // THE LOAD-BEARING ONE. The array is empty and the counter is at max --
    // exactly the shape fetchUpcomingSessions produces. The two tests above use
    // a roster that agrees with the counter, so they pass under either source;
    // this is the only test in the file that fails if isFull is switched to
    // read confirmedParticipants.length. Verified by mutation, not by hope.
    it('shows from the counter alone, with an empty participants array', () => {
      const full = baseSession({ max_participants: 2, current_participants: 2, participants: [] });
      render(<SessionCard session={full} />);
      expect(screen.getByText('Full')).toBeInTheDocument();
    });

    it('is suppressed on a past session, which cannot be joined anyway', () => {
      const past = baseSession({
        max_participants: 2,
        current_participants: 2,
        date: '2020-01-01',
        start_time: '10:00',
      });
      render(<SessionCard session={past} />);
      expect(screen.queryByText('Full')).toBeNull();
    });
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
      // Two photos is now a carousel, whose own counter also reads "1 / 2", so
      // scope this to the lightbox rather than matching the text globally.
      expect(within(screen.getByRole('dialog')).getByText('1 / 2')).toBeInTheDocument();
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

  describe('content polish', () => {
    it('builds the title from first and last name only, and never repeats it below', () => {
      const session = baseSession();
      (session.creator as unknown as Record<string, unknown>).name = 'Salomon Tabares Adarve';
      render(<SessionCard session={session} />);

      expect(screen.getByRole('heading')).toHaveTextContent('Running with Salomon Tabares');
      // The instructor row carries trust signals now, not a second copy of the name.
      expect(screen.queryByText('Salomon Tabares Adarve')).not.toBeInTheDocument();
    });

    it('keeps a custom title and still drops the name from the row', () => {
      const session = baseSession({ title: 'Sunrise 5k' } as Partial<SessionWithRelations>);
      (session.creator as unknown as Record<string, unknown>).name = 'Salomon Tabares Adarve';
      render(<SessionCard session={session} />);
      expect(screen.getByRole('heading')).toHaveTextContent('Sunrise 5k');
      expect(screen.queryByText(/Salomon/)).not.toBeInTheDocument();
    });

    it('shows the instructor session count when there is one', () => {
      const session = baseSession();
      (session.creator as unknown as Record<string, unknown>).total_sessions_hosted = 39;
      render(<SessionCard session={session} />);
      expect(screen.getByText(/39 sessions/)).toBeInTheDocument();
    });

    it('omits the session count when the instructor has none', () => {
      const session = baseSession();
      (session.creator as unknown as Record<string, unknown>).total_sessions_hosted = 0;
      render(<SessionCard session={session} />);
      expect(screen.queryByText(/sessions/)).not.toBeInTheDocument();
    });

    it('shortens a repeating Google address', () => {
      const session = baseSession({
        location: 'Cl. 20 #43g - 155, El Poblado, Medellín, El Poblado, Medellín, Antioquia, Colombia',
      } as Partial<SessionWithRelations>);
      render(<SessionCard session={session} />);
      expect(screen.getByText('Cl. 20 #43g - 155, El Poblado')).toBeInTheDocument();
    });
  });

  describe('meta badges', () => {
    it('badges women-only and men-only sessions', () => {
      render(
        <SessionCard session={baseSession({ gender_preference: 'women_only' } as Partial<SessionWithRelations>)} />
      );
      expect(screen.getByText('Women only')).toBeInTheDocument();
    });

    it('does not badge a session open to everyone', () => {
      render(<SessionCard session={baseSession({ gender_preference: 'all' } as Partial<SessionWithRelations>)} />);
      expect(screen.queryByText('Women only')).not.toBeInTheDocument();
      expect(screen.queryByText('Men only')).not.toBeInTheDocument();
    });

    it('badges a specific skill level', () => {
      render(<SessionCard session={baseSession({ skill_level: 'beginner' } as Partial<SessionWithRelations>)} />);
      expect(screen.getByText('Beginner')).toBeInTheDocument();
    });

    it('does not badge all-levels, which is most sessions and says nothing', () => {
      render(<SessionCard session={baseSession({ skill_level: 'all_levels' } as Partial<SessionWithRelations>)} />);
      for (const label of ['Beginner', 'Intermediate', 'Advanced', 'All levels']) {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
    });

    it('renders no emoji in the badges', () => {
      const { container } = render(
        <SessionCard
          session={baseSession({
            gender_preference: 'women_only',
            skill_level: 'advanced',
          } as Partial<SessionWithRelations>)}
        />
      );
      expect(container.textContent ?? '').not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    });
  });

  describe('photo carousel', () => {
    const twoPhotos = ['https://example.com/p1.jpg', 'https://example.com/p2.jpg'];

    beforeEach(() => {
      // The index hook throttles on rAF, which jsdom runs asynchronously. Make
      // it synchronous so a scroll's effect is visible by the next assertion.
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function scrollToSlide(container: HTMLElement, slide: number, width = 300) {
      const track = container.querySelector('.carousel-track') as HTMLElement;
      Object.defineProperty(track, 'clientWidth', { value: width, configurable: true });
      Object.defineProperty(track, 'scrollLeft', { value: slide * width, configurable: true });
      fireEvent.scroll(track);
      return track;
    }

    it('opens the lightbox on the slide the athlete is looking at', () => {
      const { container } = render(
        <SessionCard session={baseSession({ photos: twoPhotos } as Partial<SessionWithRelations>)} />
      );
      scrollToSlide(container, 1);
      fireEvent.click(screen.getByLabelText('View full photo'));

      // Slide 2 of 2, not reset to the first.
      expect(within(screen.getByRole('dialog')).getByText('2 / 2')).toBeInTheDocument();
    });

    it('shows carousel chrome only when there is more than one photo', () => {
      const { container: single } = render(
        <SessionCard session={baseSession({ photos: [twoPhotos[0]] } as Partial<SessionWithRelations>)} />
      );
      expect(single.querySelector('.carousel-track')).toBeNull();

      const { container: many } = render(
        <SessionCard session={baseSession({ photos: twoPhotos } as Partial<SessionWithRelations>)} />
      );
      expect(many.querySelector('.carousel-track')).toBeTruthy();
    });

    it('appends the instructor recap photos after the session photos', () => {
      const { container } = render(
        <SessionCard
          session={baseSession({ photos: [twoPhotos[0]] } as Partial<SessionWithRelations>)}
          recapPhotos={['https://example.com/r1.jpg']}
        />
      );
      expect(container.querySelector('.carousel-track')).toBeTruthy();
      expect(screen.getByLabelText('Photo 2 of 2')).toBeInTheDocument();
    });
  });
});
