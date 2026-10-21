import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));

import ProfileStatsClient from './ProfileStatsClient';
import type { ProfileStats } from './ProfilePageClient';

const BASE: ProfileStats = {
  isInstructor: true,
  sessionsCreated: 12,
  sessionsTrained: 0,
  totalSessions: 12,
  attendanceRate: 0,
  totalAttendance: 0,
};

/** Public profile tiles (T-POLISH1). */
describe('ProfileStatsClient', () => {
  it('a coach with no trained sessions does not show "0 Sesiones entrenadas"', () => {
    render(<ProfileStatsClient stats={BASE} />);
    expect(screen.queryByText('Sesiones entrenadas')).toBeNull();
    expect(screen.getByText('Sesiones Creadas')).toBeInTheDocument();
  });

  it('a coach who has trained shows the number', () => {
    render(<ProfileStatsClient stats={{ ...BASE, sessionsTrained: 3, totalSessions: 15 }} />);
    expect(screen.getByText('Sesiones entrenadas')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('an athlete with 0 still shows it', () => {
    render(<ProfileStatsClient stats={{ ...BASE, isInstructor: false, sessionsCreated: 0, totalSessions: 0 }} />);
    expect(screen.getByText('Sesiones entrenadas')).toBeInTheDocument();
  });
});
