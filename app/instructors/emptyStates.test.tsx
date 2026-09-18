import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * /instructors rendered ONE screen for THREE different situations:
 *
 *   1. the server fetch failed          -> initialInstructors = []
 *   2. no instructor passes T-PROF1     -> initialInstructors = []
 *   3. the viewer's filters matched none -> filtered.length === 0
 *
 * All three got "No instructors found" and a Clear Search button. Clear Search
 * only helps in case 3; in cases 1 and 2 the app offered a button that cleared
 * filters which were never the problem, which tells the user the failure is
 * theirs. Case 1 is the swallowed-failures pattern in CLAUDE.md: an empty list
 * is not evidence the directory is empty.
 *
 * These tests assert THE RENDERED STATE PER CAUSE. A test asserting only that
 * "empty renders the empty state" passes on the bug, because the bug is that
 * the three causes are indistinguishable.
 */

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/location', () => ({ requestUserLocation: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('next/link', () => ({ default: (p: { children?: unknown }) => <a>{p.children as never}</a> }));
vi.mock('@/components/BottomNav', () => ({ default: () => <nav /> }));
vi.mock('@/components/InstructorCard', () => ({
  default: (p: { instructor: { name: string } }) => <div data-testid="card">{p.instructor.name}</div>,
}));
vi.mock('@/components/FeaturedInstructorCarousel', () => ({ default: () => <div /> }));
vi.mock('@/components/instructors/GymsAndStudiosSection', () => ({ default: () => <div /> }));
vi.mock('@/components/ui/button', () => ({
  Button: (p: Record<string, unknown>) => <button {...(p as object)} />,
}));
vi.mock('@/components/ui/input', () => ({
  Input: (p: Record<string, unknown>) => <input {...(p as object)} />,
}));

import InstructorsPageClient from './InstructorsPageClient';
import type { InstructorProfile } from '@/lib/dal/instructors';

function instructor(over: Partial<InstructorProfile> = {}): InstructorProfile {
  return {
    id: 'i1',
    name: 'Ronald Gallego',
    avatar_url: null,
    tagline: null,
    location: 'Medellín',
    sports: ['Jiu-Jitsu'],
    specialties: ['Martial Arts'],
    verified: false,
    average_rating: 5,
    total_reviews: 2,
    total_sessions: 3,
    is_instructor: true,
    created_at: '2026-01-01T00:00:00Z',
    location_lat: null,
    location_lng: null,
    years_experience: 4,
    ...over,
  } as InstructorProfile;
}

function mount(over: Record<string, unknown> = {}) {
  render(
    <InstructorsPageClient
      initialInstructors={[]}
      instructorsFailed={false}
      gyms={[]}
      gymsFailed={false}
      {...(over as object)}
    />
  );
}

describe('/instructors tells its three empty causes apart', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cause 1, the fetch failed: says so, and offers a retry rather than Clear Search', () => {
    mount({ initialInstructors: [], instructorsFailed: true });

    expect(screen.queryByText("We couldn't load instructors")).not.toBeNull();
    expect(screen.queryByText('Try again')).not.toBeNull();
    // The button that cannot possibly help must not be here.
    expect(screen.queryByText('Clear Search')).toBeNull();
    expect(screen.queryByText('No instructors found')).toBeNull();
  });

  it('cause 1: the retry refreshes the route rather than duplicating the fetch', () => {
    mount({ initialInstructors: [], instructorsFailed: true });
    fireEvent.click(screen.getByText('Try again'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('a failure outranks the filters: still the error screen, not the no-match one', () => {
    // Both conditions hold at once. If the branches were ordered the other way
    // the viewer would be told their search was the problem while the database
    // was down.
    mount({ initialInstructors: [], instructorsFailed: true });
    expect(screen.queryByText("We couldn't load instructors")).not.toBeNull();
  });

  it('cause 2, a genuinely empty directory: no error, no Clear Search', () => {
    mount({ initialInstructors: [], instructorsFailed: false });

    expect(screen.queryByText('No instructors yet')).not.toBeNull();
    expect(screen.queryByText("We couldn't load instructors")).toBeNull();
    expect(screen.queryByText('Clear Search')).toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('cause 3, filters matched nothing but instructors exist: Clear Search, and it is the only one offered here', () => {
    mount({ initialInstructors: [instructor()], instructorsFailed: false });
    fireEvent.change(screen.getByPlaceholderText(/Search by name/i), {
      target: { value: 'nobody-by-this-name' },
    });

    expect(screen.queryByText('No instructors found')).not.toBeNull();
    expect(screen.queryByText('Clear Search')).not.toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();
    expect(screen.queryByText('No instructors yet')).toBeNull();
  });

  it('Clear Search actually restores the list, so the affordance is not decorative', () => {
    mount({ initialInstructors: [instructor()], instructorsFailed: false });
    fireEvent.change(screen.getByPlaceholderText(/Search by name/i), {
      target: { value: 'nobody-by-this-name' },
    });
    expect(screen.queryAllByTestId('card')).toHaveLength(0);

    fireEvent.click(screen.getByText('Clear Search'));
    expect(screen.queryAllByTestId('card')).toHaveLength(1);
  });

  it('the populated case renders cards and none of the three messages', () => {
    mount({ initialInstructors: [instructor()], instructorsFailed: false });

    expect(screen.queryAllByTestId('card')).toHaveLength(1);
    for (const msg of ["We couldn't load instructors", 'No instructors yet', 'No instructors found']) {
      expect(screen.queryByText(msg), `${msg} should not render with data present`).toBeNull();
    }
  });

  it('a gym-directory failure does not turn the instructor list into an error', () => {
    // The two fetches are independent. Promise.all used to couple them.
    mount({ initialInstructors: [instructor()], instructorsFailed: false, gymsFailed: true });
    expect(screen.queryAllByTestId('card')).toHaveLength(1);
    expect(screen.queryByText("We couldn't load instructors")).toBeNull();
  });
});
