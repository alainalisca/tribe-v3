import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProfileUpcomingSessions, { selectUpcoming } from './ProfileUpcomingSessions';

/**
 * T-ATH1 step 8.
 *
 * The entitlement is `hasTrainedTogether` -- the RELATION -- not `tier === 3`.
 * tierFor lets an upcoming session outrank a past one for display, so a pair
 * with both history and a shared plan resolves to tier 2; gating on the label
 * would hide this list from the most connected pairs. See useVisibilityTier.
 */

const fetchSessionsByCreator = vi.fn();
vi.mock('@/lib/dal', () => ({ fetchSessionsByCreator: (...a: unknown[]) => fetchSessionsByCreator(...a) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
const logError = vi.fn();
vi.mock('@/lib/logger', () => ({ logError: (...a: unknown[]) => logError(...a) }));
vi.mock('@/lib/translations', () => ({ translateSport: (s: string) => s }));
vi.mock('@/lib/utils', () => ({ formatTime12Hour: (t: string) => t }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const TARGET = 'target-2';
const row = (id: string, date: string, status = 'active', title: string | null = null) => ({
  id,
  title,
  sport: 'Running',
  date,
  start_time: '18:00',
  status,
});

beforeEach(() => {
  vi.clearAllMocks();
  logError.mockClear();
});

describe('selectUpcoming', () => {
  it('drops cancelled sessions', () => {
    // fetchSessionsByCreator applies the date floor but has NO status filter, so
    // this is the only thing standing between a cancelled session and a training
    // partner's profile.
    expect(selectUpcoming([row('a', '2026-12-01', 'cancelled')], '2026-09-17')).toHaveLength(0);
  });

  it('drops sessions before today and keeps today', () => {
    const out = selectUpcoming([row('old', '2026-09-16'), row('today', '2026-09-17')], '2026-09-17');
    expect(out.map((s) => s.id)).toEqual(['today']);
  });

  it('orders soonest first, then by start time', () => {
    const out = selectUpcoming(
      [row('late', '2026-12-05'), row('soon', '2026-10-01'), row('mid', '2026-11-02')],
      '2026-09-17'
    );
    expect(out.map((s) => s.id)).toEqual(['soon', 'mid', 'late']);
  });
});

describe('<ProfileUpcomingSessions />', () => {
  it('renders nothing, and does not query, without the entitlement', async () => {
    render(<ProfileUpcomingSessions userId={TARGET} hasTrainedTogether={false} language="en" heading="Upcoming" />);
    await waitFor(() => expect(fetchSessionsByCreator).not.toHaveBeenCalled());
    expect(screen.queryByTestId('profile-upcoming-sessions')).toBeNull();
  });

  it('renders the list for an entitled viewer', async () => {
    fetchSessionsByCreator.mockResolvedValue({ success: true, data: [row('s1', '2026-12-01', 'active', 'Dawn 5k')] });
    render(<ProfileUpcomingSessions userId={TARGET} hasTrainedTogether language="en" heading="Upcoming" />);
    await waitFor(() => expect(screen.getByTestId('profile-upcoming-sessions')).toBeInTheDocument());
    expect(screen.getByText('Dawn 5k')).toBeInTheDocument();
  });

  it('renders NOTHING when the athlete hosts nothing upcoming', async () => {
    fetchSessionsByCreator.mockResolvedValue({ success: true, data: [] });
    render(<ProfileUpcomingSessions userId={TARGET} hasTrainedTogether language="en" heading="Upcoming" />);
    await waitFor(() => expect(fetchSessionsByCreator).toHaveBeenCalled());
    // Deliberately not an empty state: "has no plans" is itself information.
    expect(screen.queryByTestId('profile-upcoming-sessions')).toBeNull();
  });

  it('renders NOTHING when the read fails, and REPORTS the failure', async () => {
    fetchSessionsByCreator.mockResolvedValue({ success: false, error: 'permission denied' });
    render(<ProfileUpcomingSessions userId={TARGET} hasTrainedTogether language="en" heading="Upcoming" />);
    await waitFor(() => expect(fetchSessionsByCreator).toHaveBeenCalled());

    expect(screen.queryByTestId('profile-upcoming-sessions')).toBeNull();

    // "hosts nothing" and "the query failed" are different statements and only
    // one of them is ours to make -- but they RENDER identically, since an empty
    // list also renders nothing. A mutation run proved the render assertion
    // alone cannot tell them apart, so assert the failure was recognised.
    await waitFor(() => expect(logError).toHaveBeenCalled());
    expect((logError.mock.calls[0][0] as Error).message).toContain('permission denied');
  });

  it('asks only for future sessions, so the whole history is not pulled', async () => {
    fetchSessionsByCreator.mockResolvedValue({ success: true, data: [] });
    render(<ProfileUpcomingSessions userId={TARGET} hasTrainedTogether language="en" heading="Upcoming" />);
    await waitFor(() => expect(fetchSessionsByCreator).toHaveBeenCalled());
    const opts = fetchSessionsByCreator.mock.calls[0][2];
    expect(opts.dateGte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(opts.fields).toContain('status');
  });
});
