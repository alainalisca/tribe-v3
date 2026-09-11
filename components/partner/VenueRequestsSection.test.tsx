/**
 * The recurring warning (T-GYM2).
 *
 * createChildSession copies the gym's verdict onto every generated occurrence,
 * so approving a recurring parent grants the venue for the whole series. A gym
 * that reads the row as one Tuesday session and gets every Tuesday until March
 * has been misled by this screen, so the warning is asserted rather than
 * assumed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import VenueRequestsSection from './VenueRequestsSection';
import type { VenueRequest } from '@/lib/dal/gymVenue';

vi.mock('@/lib/i18n/useTranslations', () => ({
  useTranslations: () => (key: string, v?: Record<string, string | number>) =>
    key === 'recurringWarning'
      ? 'This session repeats weekly. Approving it applies to every future occurrence, not just this date.'
      : key === 'requestedOn'
        ? `Requested ${v?.date}`
        : key,
}));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: () => null,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const BASE: VenueRequest = {
  sessionId: 's1',
  title: 'Morning CrossFit',
  sport: 'CrossFit',
  date: '2026-09-20',
  startTime: '06:00',
  duration: 60,
  isPaid: false,
  priceCents: null,
  currency: 'COP',
  instructor: { id: 'leo', name: 'Leo Garcia', avatarUrl: null, averageRating: 4.8, totalSessionsHosted: 17 },
  notOnRoster: false,
  requestedAt: '2026-09-19T06:00:00Z',
  isRecurring: false,
};

function renderSection(request: VenueRequest) {
  return render(
    <VenueRequestsSection
      gymName="CrossFit BullBox"
      requests={[request]}
      loading={false}
      deciding={null}
      autoApprove
      onDecide={() => {}}
      onToggleAutoApprove={() => {}}
    />
  );
}

describe('VenueRequestsSection', () => {
  it('warns that approving a recurring session covers every future occurrence', () => {
    renderSection({ ...BASE, isRecurring: true });
    expect(screen.getByText(/every future occurrence/i)).toBeTruthy();
  });

  it('shows no such warning on a one-off session', () => {
    // The other half: if this passed for both, the warning would be noise.
    renderSection(BASE);
    expect(screen.queryByText(/every future occurrence/i)).toBeNull();
  });

  it('puts the warning above the approve button, not below it', () => {
    // Below the button it is a changelog entry, not a warning.
    const { container } = renderSection({ ...BASE, isRecurring: true });
    const html = container.innerHTML;
    expect(html.indexOf('every future occurrence')).toBeLessThan(html.indexOf('approve'));
  });

  it('shows when the request was made, as a date', () => {
    renderSection(BASE);
    expect(screen.getByText(/^Requested /)).toBeTruthy();
  });

  it('renders a calm empty state rather than an error', () => {
    render(
      <VenueRequestsSection
        gymName="CrossFit BullBox"
        requests={[]}
        loading={false}
        deciding={null}
        autoApprove
        onDecide={() => {}}
        onToggleAutoApprove={() => {}}
      />
    );
    expect(screen.getByText('noRequests')).toBeTruthy();
  });
});
