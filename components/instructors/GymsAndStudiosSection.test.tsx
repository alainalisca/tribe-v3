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
      passPill: 'Clase gratis',
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
  // The default case, and the one every gym but BullBox is in: a partner row
  // with a slug (NOT NULL, trigger-filled) and no pass. pass_active is what
  // discriminates, so it is what each pass test below varies.
  slug: 'bullbox',
  pass_active: false,
};

describe('GymsAndStudiosSection', () => {
  it('renders a rounded square, never a circle', () => {
    // The visual grammar from T-GYM1. If this ever passes with rounded-full,
    // a gym is indistinguishable from a person at a glance.
    //
    // ASSERTED ON THE AVATAR ELEMENT, NOT ON container.innerHTML. The original
    // scanned the whole card for the string 'rounded-full', which happened to
    // work only while nothing else on the card was round. T-LEAD2's pass pill
    // is a rounded-full chip, and a whole-HTML scan would have read that as the
    // gym's logo turning into a circle -- a false failure that says nothing
    // about the thing the test exists to protect.
    const { container } = render(<GymsAndStudiosSection gyms={[BULLBOX]} />);
    const avatar = container.querySelector('.w-20.h-20');
    expect(avatar).toBeTruthy();
    expect(avatar!.className).toContain('rounded-2xl');
    expect(avatar!.className).not.toContain('rounded-full');
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
    // querySelector('a') would have meant "the first anchor", which the pass
    // pill becomes the moment a gym has a pass. Select the one under test.
    const { container } = render(<GymsAndStudiosSection gyms={[BULLBOX]} />);
    const link = container.querySelector('a[href="/storefront/gym-user"]');
    expect(link).toBeTruthy();
    expect(link!.textContent).toBe('Ver gimnasio');
  });

  /**
   * T-LEAD2. The pill is the directory's entry into the free-class pass.
   *
   * Asserted on the DESTINATION, not on the label: the label is a translation
   * and can change, while the URL carries the attribution the admin view reads
   * back. A pill pointing at the right page with the wrong code is invisible in
   * the product and wrong in every report.
   */
  it('shows a pass pill that carries the card attribution when the gym has a pass', () => {
    const { container } = render(<GymsAndStudiosSection gyms={[{ ...BULLBOX, pass_active: true }]} />);
    const pill = container.querySelector('a[href^="/pase/"]');
    expect(pill).toBeTruthy();
    expect(pill!.getAttribute('href')).toBe('/pase/bullbox/?src=app&code=APP-CARD');
    expect(pill!.textContent).toContain('Clase gratis');
  });

  it('shows no pill for a gym without a pass', () => {
    const { container } = render(<GymsAndStudiosSection gyms={[BULLBOX]} />);
    expect(container.querySelector('a[href^="/pase/"]')).toBeNull();
  });

  /**
   * The rest of the card must be untouched for a gym with no pass, which is
   * every gym but BullBox. Compared against a render of the same fixture rather
   * than against a description of it, so this cannot drift into agreeing with
   * whatever the card happens to produce.
   */
  it('leaves the card byte-identical for a gym without a pass', () => {
    const withPass = render(<GymsAndStudiosSection gyms={[{ ...BULLBOX, pass_active: true }]} />);
    const withoutPass = render(<GymsAndStudiosSection gyms={[BULLBOX]} />);
    // Witness: the two renders differ at all, so the comparison below is not
    // trivially true against an unchanged component.
    expect(withPass.container.innerHTML).not.toBe(withoutPass.container.innerHTML);
    expect(withoutPass.container.querySelector('a[href="/storefront/gym-user"]')).toBeTruthy();
    expect(withoutPass.container.textContent).not.toContain('Clase gratis');
  });

  it('keeps the rest of the card reachable when the pill is present', () => {
    // Anchor-inside-an-anchor would make the card's own button unreachable in
    // some browsers. The pill is a sibling, so both links exist side by side.
    const { container } = render(<GymsAndStudiosSection gyms={[{ ...BULLBOX, pass_active: true }]} />);
    const pill = container.querySelector('a[href^="/pase/"]')!;
    expect(pill.querySelector('a')).toBeNull();
    expect(pill.closest('a[href="/storefront/gym-user"]')).toBeNull();
    expect(container.querySelector('a[href="/storefront/gym-user"]')).toBeTruthy();
  });

  it('hides itself when there are no gyms', () => {
    const { container } = render(<GymsAndStudiosSection gyms={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
