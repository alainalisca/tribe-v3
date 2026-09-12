/**
 * Gym tiles use the instructor card's shell, with one deliberate difference
 * (T-GYM2).
 *
 * The first version was a narrow chip under a grid of full cards and read as a
 * footer note. The shape of the image is the one thing that must NOT be
 * harmonised: people are circles, organisations are rounded squares.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GymsAndStudiosSection from './GymsAndStudiosSection';
import type { GymDirectoryEntry } from '@/lib/dal/gymDirectory';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/i18n/useTranslations', () => ({
  useTranslations: () => (key: string) =>
    ({
      typeGym: 'Gimnasio',
      typeStudio: 'Estudio',
      viewGym: 'Ver gimnasio',
      gymsAndStudios: 'Gimnasios y estudios',
      sessionsPerWeek: 'sesiones / semana',
    })[key] ?? key,
}));

const BULLBOX: GymDirectoryEntry = {
  id: 'p1',
  business_name: 'CrossFit BullBox',
  business_type: 'gym',
  logo_url: null,
  status: 'active',
  user_id: 'gym-user',
  address: 'Cra 43G #25a-50, El Poblado, Medellín',
  specialties: ['CrossFit'],
  coachCount: 0,
  sessionsPerWeek: 4,
  accountAvatarUrl: 'https://cdn/avatar.jpg',
};

describe('GymsAndStudiosSection', () => {
  it('renders a rounded square, never a circle', () => {
    // The visual grammar from T-GYM1. If this ever passes with rounded-full,
    // a gym is indistinguishable from a person at a glance.
    const { container } = render(<GymsAndStudiosSection gyms={[BULLBOX]} />);
    expect(container.querySelector('.rounded-2xl')).toBeTruthy();
    expect(container.innerHTML).not.toContain('rounded-full');
  });

  it('falls back to the account avatar when the partner has no logo', () => {
    // Same chain as the storefront, so a gym cannot show its logo on one
    // surface and a monogram on the other.
    const { container } = render(<GymsAndStudiosSection gyms={[BULLBOX]} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn/avatar.jpg');
  });

  it('uses the monogram only when neither logo nor avatar exists', () => {
    const { container } = render(<GymsAndStudiosSection gyms={[{ ...BULLBOX, accountAvatarUrl: null }]} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('CB')).toBeTruthy();
  });

  it('shows the neighbourhood, not the street', () => {
    render(<GymsAndStudiosSection gyms={[BULLBOX]} />);
    expect(screen.getByText('El Poblado')).toBeTruthy();
    expect(screen.queryByText(/Cra 43G/)).toBeNull();
  });

  it('omits the location line entirely when no neighbourhood is recognised', () => {
    render(<GymsAndStudiosSection gyms={[{ ...BULLBOX, address: 'Cra 43G #25a-50' }]} />);
    expect(screen.queryByText(/Cra 43G/)).toBeNull();
  });

  it('hides sessions per week at zero rather than showing "0"', () => {
    render(<GymsAndStudiosSection gyms={[{ ...BULLBOX, sessionsPerWeek: 0 }]} />);
    expect(screen.queryByText(/sesiones \/ semana/)).toBeNull();
  });

  it('never shows a rating', () => {
    const { container } = render(<GymsAndStudiosSection gyms={[BULLBOX]} />);
    expect(container.innerHTML).not.toContain('★');
    expect(container.textContent).not.toMatch(/\d\.\d/);
  });

  it('links to the storefront with a Ver gimnasio button', () => {
    const { container } = render(<GymsAndStudiosSection gyms={[BULLBOX]} />);
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/storefront/gym-user');
    expect(link?.textContent).toBe('Ver gimnasio');
  });

  it('hides itself when there are no gyms', () => {
    const { container } = render(<GymsAndStudiosSection gyms={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
