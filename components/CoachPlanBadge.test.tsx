import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es', t: (k: string) => k }) }));

import CoachPlanBadge from './CoachPlanBadge';
import CoachesDestacadosRow from './home/CoachesDestacadosRow';

afterEach(() => vi.unstubAllEnvs());

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const proSession = {
  id: 's1',
  title: 'Funcional',
  sport: 'Running',
  date: tomorrow,
  start_time: '07:00:00',
  status: 'active',
  participants: [],
  creator: { id: 'u1', name: 'Andrés', avatar_url: null, average_rating: null, total_reviews: null, coach_plan: 'pro' },
} as never;

describe('T-PLAN1 visible pieces with COACH_PLANS_ENABLED off', () => {
  it('the badge renders nothing, even for a paid plan', () => {
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'false');
    const { container } = render(<CoachPlanBadge plan="pro" />);
    expect(container.innerHTML).toBe('');
  });

  it('the Coaches destacados row renders nothing', () => {
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'false');
    const { container } = render(<CoachesDestacadosRow sessions={[proSession]} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('with COACH_PLANS_ENABLED on', () => {
  it('shows Pro for paid plans, Embajador for ambassadors, nothing for basico', () => {
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'true');
    const { rerender, container } = render(<CoachPlanBadge plan="crecimiento" />);
    expect(screen.getByText('Pro')).toBeTruthy();
    rerender(<CoachPlanBadge plan="embajador" />);
    expect(screen.getByText('Embajador')).toBeTruthy();
    rerender(<CoachPlanBadge plan="basico" />);
    expect(container.innerHTML).toBe('');
  });

  it('the row shows upcoming sessions by paid coaches, and hides when there are none', () => {
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'true');
    const { container, rerender } = render(<CoachesDestacadosRow sessions={[proSession]} />);
    expect(screen.getByText('Coaches destacados')).toBeTruthy();
    expect(screen.getByText('Funcional')).toBeTruthy();
    // The session's own calendar day, never the day before (Bogota is UTC-5).
    const [y, m, d] = tomorrow.split('-').map(Number);
    const expected = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-CO', {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    expect(container.textContent).toContain(expected);
    rerender(<CoachesDestacadosRow sessions={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
