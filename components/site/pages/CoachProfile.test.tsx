import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { WeekRow } from '@/lib/site/weekTypes';
import CoachProfile, { type CoachProfileData } from './CoachProfile';

/** T-SHARE1 Part E: the public coach page in the Jornada frame, matching the card. */
function row(id: string, date = '2026-10-19', over: Partial<WeekRow> = {}): WeekRow {
  return {
    id,
    seriesId: id,
    sport: 'Boxing',
    title: null,
    date,
    startTime: '06:00',
    weekdays: [1],
    duration: 60,
    place: 'Zona de Combate',
    price: null,
    spotsLeft: 4,
    creatorId: 'c1',
    creatorFirstName: 'Salomon',
    creatorName: 'Salomon T.',
    creatorAvatarUrl: null,
    ...over,
  };
}
const salomon: CoachProfileData = {
  name: 'Salomon Tabares',
  sports: ['Boxing', 'Muay Thai'],
  bio: 'Boxeo y Muay Thai en Medellín.',
  specialties: ['Boxeo', 'Defensa personal'],
};
const photo = { url: 'https://x.supabase.co/storage/v1/object/public/profile-images/s.jpg', x: 50, y: 40 };
const hrefOf = (l: Element) => (l.getAttribute('href') ?? '').replace(/\/$/, '');
const base = { gym: 'Zona de Combate', weekEnd: '2026-10-23' };

describe('the coach page', () => {
  it("opens on the card's photo, centred on the card's crop, then the name with the dot, sport and gym", () => {
    render(<CoachProfile lang="es" coach={salomon} photo={photo} sessions={[]} {...base} />);
    const img = screen.getByRole('img', { name: 'Salomon entrenando' });
    expect(img.getAttribute('style')).toMatch(/object-position:\s*50% 40%/);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Salomon Tabares');
    expect(screen.getByText('Boxeo · Muay Thai · Zona de Combate')).toBeTruthy();
  });

  it('with no photo: the initials block, and no image at all (never a logo, never an avatar)', () => {
    const { container } = render(
      <CoachProfile
        lang="es"
        coach={{ ...salomon, name: 'Caroline' }}
        photo={null}
        sessions={[]}
        {...base}
        gym={null}
      />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('C');
    expect(screen.getByText(/· Medellín$/)).toBeTruthy();
  });

  it('lists upcoming sessions as the board rows, each with one Reserva that opens the session page', () => {
    render(<CoachProfile lang="es" coach={salomon} photo={photo} sessions={[row('s1'), row('s2')]} {...base} />);
    const list = screen.getByRole('heading', { name: 'Próximas clases' }).parentElement as HTMLElement;
    const links = within(list).getAllByRole('link');
    expect(links.map(hrefOf)).toEqual(['/session/s1', '/session/s2']);
    for (const l of links) expect(l.textContent).toContain('Reserva');
    expect(list.textContent).not.toContain('Pedir cupo');
  });

  it('shows a date, not just a weekday, for a session past this week', () => {
    render(
      <CoachProfile
        lang="es"
        coach={salomon}
        photo={photo}
        sessions={[row('s1', '2026-11-04', { weekdays: [3] })]}
        {...base}
      />
    );
    expect(screen.getByText('4 nov')).toBeTruthy();
  });

  it('with no sessions: the ink block, and nothing that counts sessions', () => {
    const { container } = render(<CoachProfile lang="es" coach={salomon} photo={photo} sessions={[]} {...base} />);
    expect(screen.getByText('Todavía no hay clases publicadas')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\b0\b|sesiones|sessions/i);
    expect(container.textContent).not.toMatch(/Entrena con tu tribu|Train with your tribe/);
  });

  it('then the bio and specialties; in English from the messages', () => {
    render(<CoachProfile lang="en" coach={salomon} photo={photo} sessions={[]} {...base} />);
    expect(screen.getByRole('heading', { name: 'About Salomon' })).toBeTruthy();
    expect(screen.getByText('Boxeo y Muay Thai en Medellín.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Specialties' })).toBeTruthy();
    expect(screen.getByText('Defensa personal')).toBeTruthy();
    expect(screen.getByText('No classes published yet')).toBeTruthy();
    expect(screen.getByText('Boxing · Muay Thai · Zona de Combate')).toBeTruthy();
  });

  it('shows a long specialty as a line, a short one as a chip', () => {
    const { container } = render(
      <CoachProfile
        lang="es"
        coach={{ ...salomon, specialties: ['CrossFit', 'I give 110% to help you achieve your dream skill'] }}
        photo={photo}
        sessions={[]}
        {...base}
      />
    );
    const items = [...container.querySelectorAll('section li')].map((li) => [
      li.parentElement?.className,
      li.textContent,
    ]);
    expect(items[0][0]).not.toBe(items[1][0]);
  });
});
