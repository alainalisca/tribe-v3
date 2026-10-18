import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * T-JOIN1 Part D: NEXT_PUBLIC_FEED_LITE. Every child of the feed is a named
 * marker, so a render reads as the feed's composition in order.
 *
 *   flag off  exactly what main rendered before Part D (the snapshot was
 *             written against the unchanged app/page.tsx, then kept)
 *   flag on   none of the nine interstitials; ProfileCompletionBanner stays
 */

// Hoisted with the vi.mock calls that use it.
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => ({
    default: (p: { children?: ReactNode }) => <div data-c={name}>{p.children}</div>,
  }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => <div data-c="Dynamic" /> }));
vi.mock('@/components/SessionCard', () => stub('SessionCard'));
vi.mock('@/components/BottomNav', () => stub('BottomNav'));
vi.mock('@/components/NotificationPrompt', () => stub('NotificationPrompt'));
vi.mock('@/components/ProfileCompletionBanner', () => stub('ProfileCompletionBanner'));
vi.mock('@/components/StreakBanner', () => stub('StreakBanner'));
vi.mock('@/components/ReferralBanner', () => stub('ReferralBanner'));
vi.mock('@/components/Skeleton', () => ({ SkeletonCard: () => <div data-c="SkeletonCard" /> }));
vi.mock('@/components/StoriesRow', () => stub('StoriesRow'));
vi.mock('@/components/LazyMount', () => stub('LazyMount'));
vi.mock('@/components/home/FilterBar', () => stub('FilterBar'));
vi.mock('@/components/home/CityGreeting', () => stub('CityGreeting'));
vi.mock('@/components/home/LiveNowSection', () => stub('LiveNowSection'));
vi.mock('@/components/ConfirmDialog', () => stub('ConfirmDialog'));
vi.mock('@/components/FeaturedInstructors', () => stub('FeaturedInstructors'));
vi.mock('@/components/FeaturedPartnerBanner', () => stub('FeaturedPartnerBanner'));
vi.mock('@/components/atletas/AthletesEntryCard', () => stub('AthletesEntryCard'));
vi.mock('@/components/FindTrainingPartners', () => stub('FindTrainingPartners'));
vi.mock('@/components/LocalFitnessEventsSection', () => stub('LocalFitnessEventsSection'));
vi.mock('@/components/AnimatedCard', () => stub('AnimatedCard'));
vi.mock('@/components/PullToRefreshIndicator', () => stub('PullToRefreshIndicator'));
vi.mock('@/components/StoriesCarousel', () => stub('StoriesCarousel'));
vi.mock('@/components/PopularVenuesSection', () => stub('PopularVenuesSection'));
vi.mock('@/components/PopularRoutesSection', () => stub('PopularRoutesSection'));
vi.mock('@/components/home/ExploreCitySection', () => stub('ExploreCitySection'));
vi.mock('@/components/home/FeedPostPreview', () => stub('FeedPostPreview'));
vi.mock('@/components/FirstMoverCTA', () => stub('FirstMoverCTA'));
vi.mock('@/components/InstructorUpsellBanner', () => stub('InstructorUpsellBanner'));
vi.mock('@/hooks/usePullToRefresh', () => ({
  usePullToRefresh: () => ({ pullDistance: 0, isRefreshing: false, handlers: {} }),
}));
vi.mock('@/lib/location', () => ({ requestUserLocation: vi.fn() }));
vi.mock('@/lib/toast', () => ({ showInfo: vi.fn() }));
vi.mock('./StaleSessionToSite', () => stub('StaleSessionToSite'));

const state = vi.hoisted(() => ({ feed: {} as Record<string, unknown> }));
vi.mock('./useHomeFeed', () => ({ useHomeFeed: () => state.feed }));

import HomePage from './page';

const LITE_REMOVED = [
  'StoriesRow',
  'StoriesCarousel',
  'FeaturedPartnerBanner',
  'PopularVenuesSection',
  'PopularRoutesSection',
  'ExploreCitySection',
  'StreakBanner',
  'ReferralBanner',
  'InstructorUpsellBanner',
];

/** A composition minus the nine sections, and minus the LazyMount that wrapped one of them. */
function withoutLiteSections(order: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < order.length; i++) {
    if (order[i] === 'LazyMount' && LITE_REMOVED.includes(order[i + 1])) {
      i++;
      continue;
    }
    if (!LITE_REMOVED.includes(order[i])) out.push(order[i]);
  }
  return out;
}

function makeFeed(over: { sessions?: number; profileComplete?: boolean } = {}) {
  const n = over.sessions ?? 20;
  const sessions = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, creator_id: `c${i}`, partner_id: null }));
  return {
    userChecked: true,
    user: { id: 'u1' },
    userProfile: over.profileComplete
      ? { avatar_url: 'a.jpg', name: 'Ana', sports: ['Yoga'], is_instructor: false }
      : { avatar_url: null, name: 'Ana', sports: [], is_instructor: false },
    suppressOnboarding: true,
    searchQuery: '',
    selectedSport: '',
    dateFilter: 'all',
    genderFilter: 'all',
    pricingFilter: 'all',
    maxDistance: null,
    selectedNeighborhood: null,
    userLocation: null,
    locationKnown: true,
    loading: false,
    fetchError: false,
    filteredSessions: sessions,
    visibleCount: n,
    PAGE_SIZE: 20,
    liveNowSessions: [],
    liveUserIdSet: new Set(),
    liveStatusMap: {},
    recapPhotosByCreator: {},
    partnersById: new Map(),
    partnersByCreator: new Map(),
    fixedHeight: 0,
    language: 'es',
    t: (k: string) => k,
    router: { push: vi.fn() },
    getDistanceText: () => null,
    showSafetyWaiver: false,
    confirmAction: null,
    loadSessions: vi.fn(),
    setFixedHeight: vi.fn(),
  };
}

/** The feed's composition: every marker in document order, nested ones included. */
function composition(over: Parameters<typeof makeFeed>[0] = {}): string[] {
  state.feed = makeFeed(over);
  const { container, unmount } = render(<HomePage />);
  const order = [...container.querySelectorAll('[data-c]')].map((el) => el.getAttribute('data-c')!);
  unmount();
  return order;
}

const ORIGINAL = process.env.NEXT_PUBLIC_FEED_LITE;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_FEED_LITE;
  else process.env.NEXT_PUBLIC_FEED_LITE = ORIGINAL;
});

describe('feed, flag off (the default)', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_FEED_LITE;
  });

  it('renders exactly what main renders: 20 sessions, incomplete profile', () => {
    expect(composition()).toMatchSnapshot();
  });

  it('renders exactly what main renders: 20 sessions, complete profile', () => {
    expect(composition({ profileComplete: true })).toMatchSnapshot();
  });

  it('renders exactly what main renders: an empty feed', () => {
    expect(composition({ sessions: 0 })).toMatchSnapshot();
  });

  it('"false" is off too', () => {
    const off = composition();
    process.env.NEXT_PUBLIC_FEED_LITE = 'false';
    expect(composition()).toEqual(off);
  });
});

describe('feed, flag on', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FEED_LITE = 'true';
  });

  it.each([
    ['20 sessions, incomplete profile', {}],
    ['20 sessions, complete profile', { profileComplete: true }],
    ['an empty feed', { sessions: 0 }],
  ])('renders none of the nine interstitials: %s', (_label, over) => {
    const order = composition(over);
    for (const name of LITE_REMOVED) expect(order).not.toContain(name);
    expect(order.filter((c) => c === 'SessionCard')).toHaveLength((over as { sessions?: number }).sessions ?? 20);
  });

  it('keeps ProfileCompletionBanner for an incomplete profile', () => {
    expect(composition()).toContain('ProfileCompletionBanner');
  });

  it('keeps everything else, in the same order', () => {
    for (const profileComplete of [false, true]) {
      process.env.NEXT_PUBLIC_FEED_LITE = 'false';
      const off = composition({ profileComplete });
      process.env.NEXT_PUBLIC_FEED_LITE = 'true';
      expect(composition({ profileComplete })).toEqual(withoutLiteSections(off));
    }
  });
});
