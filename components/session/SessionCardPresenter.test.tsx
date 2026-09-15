/**
 * Gym identity lives in the presenter row, never over the photo (Al, 2026-09-10).
 *
 * The hero belongs to LIVE, the photo counter and, later, the video pill. Three
 * elements fought for that corner and the gym name truncated to "CrossF...",
 * which reads as broken rather than branded.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionCardPresenter from './SessionCardPresenter';
import { resolveSessionGym, type SessionGymSource } from '@/lib/sessionGym';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/i18n/useTranslations', () => ({
  useTranslations: () => (key: string, v?: Record<string, string | number>) =>
    key === 'coachAt' ? `Coach ${v?.gym}` : key === 'pendingTag' ? `Pendiente · ${v?.gym}` : key,
}));

const BULLBOX: SessionGymSource = {
  id: 'p1',
  business_name: 'CrossFit BullBox',
  business_type: 'gym',
  logo_url: null,
  status: 'active',
  user_id: 'gym-user',
};
const COACH = 'coach-user';
const creator = { name: 'Leo Garcia', avatar_url: null, average_rating: 4.8 };
const tCard = (k: string) => k;

function renderRow(gymArgs: Parameters<typeof resolveSessionGym>[0], coachCount = 0) {
  return render(
    <SessionCardPresenter
      gym={resolveSessionGym(gymArgs)}
      creator={creator}
      instructorName="Leo Garcia"
      sessionsHosted={12}
      coachCount={coachCount}
      tCard={tCard}
    />
  );
}

describe('SessionCardPresenter gym identity', () => {
  it('names the venue in full beside a coach on no roster', () => {
    // Today's live state: partner_instructors is empty.
    renderRow({ sessionPartner: BULLBOX, sessionPartnerStatus: 'approved', creatorId: COACH });
    expect(screen.getByText('CrossFit BullBox')).toBeTruthy();
    expect(screen.queryByText(/^Coach /)).toBeNull();
  });

  it('says "Coach {gym}" once the instructor is on the roster', () => {
    renderRow({
      sessionPartner: BULLBOX,
      sessionPartnerStatus: 'approved',
      creatorPartner: BULLBOX,
      creatorId: COACH,
    });
    expect(screen.getByText('Coach CrossFit BullBox')).toBeTruthy();
  });

  it('prints the gym once, not twice, when venue and affiliation are the same place', () => {
    const { container } = renderRow({
      sessionPartner: BULLBOX,
      sessionPartnerStatus: 'approved',
      creatorPartner: BULLBOX,
      creatorId: COACH,
    });
    expect(container.textContent?.match(/CrossFit BullBox/g)).toHaveLength(1);
  });

  it('leaves the gym-hosted row exactly as it was', () => {
    // GymHostRow is already the gym; a second mark beside it would be the same
    // logo twice on one card.
    const { container } = renderRow({
      sessionPartner: BULLBOX,
      sessionPartnerStatus: 'approved',
      creatorId: 'gym-user',
    });
    expect(container.textContent).toContain('verified');
    expect(container.textContent?.match(/CrossFit BullBox/g)).toHaveLength(1);
  });

  it('shows Pendiente to the creator and nothing to anyone else', () => {
    const args = { sessionPartner: BULLBOX, sessionPartnerStatus: 'pending', creatorId: COACH };
    renderRow({ ...args, viewerId: COACH });
    expect(screen.getByText('Pendiente · CrossFit BullBox')).toBeTruthy();

    const other = renderRow({ ...args, viewerId: 'someone-else' });
    expect(other.container.textContent).not.toContain('CrossFit BullBox');
  });

  it('renders no gym element at all for an unaffiliated instructor', () => {
    const { container } = renderRow({ creatorId: COACH, viewerId: COACH });
    expect(container.textContent).not.toContain('BullBox');
  });
});
