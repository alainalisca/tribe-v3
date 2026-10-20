import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/useUserCurrency', () => ({ useUserCurrency: () => ({ currency: 'COP' }) }));

import SessionCard from './SessionCard';
import { getSessionsTranslations } from './translations';

const txt = getSessionsTranslations('es');
const BASE = {
  id: 's1',
  sport: 'Yoga',
  date: '2026-10-25',
  start_time: '07:00',
  location: 'Parque',
  current_participants: 2,
  max_participants: 10,
  status: 'active',
};
const sportName = (s: string) => s;

/** Mis sesiones cards (T-POLISH1): who it belongs to, its title, and whether it was cancelled. */
describe('SessionCard', () => {
  it('my own session reads "Organizaste" and shows its title', () => {
    render(
      <SessionCard
        session={{ ...BASE, creator_id: 'me', title: 'Yoga al amanecer' }}
        getSportName={sportName}
        txt={txt}
        language="es"
        userId="me"
      />
    );
    expect(screen.getByText('Organizaste')).toBeInTheDocument();
    expect(screen.getByText('Yoga al amanecer')).toBeInTheDocument();
  });

  it('a session I joined reads "Te uniste", and an untitled one is named after sport and host', () => {
    render(
      <SessionCard
        session={{ ...BASE, creator_id: 'coach', title: null, creator: { name: 'Salomón Taborda' } }}
        getSportName={sportName}
        txt={txt}
        language="es"
        userId="me"
      />
    );
    expect(screen.getByText('Te uniste')).toBeInTheDocument();
    expect(screen.getByText('Yoga con Salomón')).toBeInTheDocument();
  });

  it('a cancelled past session reads "Cancelada", not "Terminada"', () => {
    render(
      <SessionCard
        session={{ ...BASE, creator_id: 'me', status: 'cancelled' }}
        getSportName={sportName}
        txt={txt}
        language="es"
        userId="me"
        isPast
      />
    );
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
    expect(screen.queryByText('Terminada')).toBeNull();
  });
});
