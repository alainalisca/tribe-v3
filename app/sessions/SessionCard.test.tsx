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
  it('Próximas: no "Organizaste" / "Te uniste" pill (the section header already says it)', () => {
    render(
      <SessionCard
        session={{ ...BASE, creator_id: 'me', title: 'Yoga al amanecer' }}
        getSportName={sportName}
        txt={txt}
        language="es"
        userId="me"
      />
    );
    expect(screen.queryByText('Organizaste')).toBeNull();
    expect(screen.queryByText('Te uniste')).toBeNull();
    expect(screen.getByText('Yoga al amanecer')).toBeInTheDocument();
  });

  it('Historial: my own session reads "Organizaste", one I joined "Te uniste"', () => {
    const { unmount } = render(
      <SessionCard
        session={{ ...BASE, creator_id: 'me' }}
        getSportName={sportName}
        txt={txt}
        language="es"
        userId="me"
        isPast
      />
    );
    expect(screen.getByText('Organizaste')).toBeInTheDocument();
    unmount();
    render(
      <SessionCard
        session={{ ...BASE, creator_id: 'coach', creator: { name: 'Salomón Taborda' } }}
        getSportName={sportName}
        txt={txt}
        language="es"
        userId="me"
        isPast
      />
    );
    expect(screen.getByText('Te uniste')).toBeInTheDocument();
  });

  it('an untitled session is named after sport and host', () => {
    render(
      <SessionCard
        session={{ ...BASE, creator_id: 'coach', title: null, creator: { name: 'Salomón Taborda' } }}
        getSportName={sportName}
        txt={txt}
        language="es"
        userId="me"
      />
    );
    expect(screen.getByText('Yoga con Salomón')).toBeInTheDocument();
  });

  it('a title that only repeats the sport gets the fallback, folded for case and accents', () => {
    const { unmount } = render(
      <SessionCard
        session={{ ...BASE, sport: 'HYROX', creator_id: 'coach', title: 'HYROX', creator: { name: 'Neera Rao' } }}
        getSportName={sportName}
        txt={txt}
        language="es"
        userId="me"
      />
    );
    expect(screen.getByText('HYROX con Neera')).toBeInTheDocument();
    unmount();
    render(
      <SessionCard
        session={{ ...BASE, sport: 'Running', creator_id: 'coach', title: 'CORRER', creator: { name: 'Ana' } }}
        getSportName={sportName}
        txt={txt}
        language="es"
        userId="me"
      />
    );
    expect(screen.getByText('Correr con Ana')).toBeInTheDocument();
  });

  it('my own sport-only session uses my name', () => {
    render(
      <SessionCard
        session={{ ...BASE, sport: 'HYROX', creator_id: 'me', title: 'hyrox' }}
        getSportName={sportName}
        txt={txt}
        language="es"
        userId="me"
        ownName="Host Prueba"
      />
    );
    expect(screen.getByText('HYROX con Host')).toBeInTheDocument();
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
