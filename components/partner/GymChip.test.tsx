import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GymChip from './GymChip';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The real hook reads messages/{en,es}.json; the chip only needs the two type
// labels, and asserting on the real keys would make this a translation test.
vi.mock('@/lib/i18n/useTranslations', () => ({
  useTranslations: () => (key: string) => (key === 'typeStudio' ? 'Studio' : 'Gym'),
}));

describe('GymChip', () => {
  it('renders the monogram fallback when the gym has no logo', () => {
    // Both live partners have logo_url = null, so this is the branch that
    // actually ships until a gym uploads one.
    const { container } = render(<GymChip name="CrossFit BullBox" type="gym" logoUrl={null} />);
    expect(screen.getByText('CB')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('takes the first letter of only the first two words', () => {
    render(<GymChip name="Bull Box Ciudad del Río" type="gym" />);
    expect(screen.getByText('BB')).toBeTruthy();
  });

  it('renders the logo instead of the monogram when one exists', () => {
    const { container } = render(
      <GymChip name="CrossFit BullBox" type="gym" logoUrl="https://example.test/logo.png" />
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.test/logo.png');
    expect(screen.queryByText('CB')).toBeNull();
  });

  it('renders the uppercase type label for a gym', () => {
    render(<GymChip name="CrossFit BullBox" type="gym" />);
    expect(screen.getByText('GYM')).toBeTruthy();
  });

  it('renders the uppercase type label for a studio', () => {
    render(<GymChip name="Marce Anahata" type="studio" />);
    expect(screen.getByText('STUDIO')).toBeTruthy();
  });

  it('never renders a circular logo, at either size', () => {
    // The identity rule: organizations are rounded squares, people are circles.
    for (const size of ['sm', 'md'] as const) {
      const { container } = render(<GymChip name="CrossFit BullBox" type="gym" size={size} />);
      expect(container.innerHTML).not.toContain('rounded-full');
    }
  });

  it('labels itself for screen readers as an organization', () => {
    render(<GymChip name="CrossFit BullBox" type="gym" />);
    expect(screen.getByLabelText('CrossFit BullBox, gym')).toBeTruthy();
  });

  it('links to the storefront when href is given', () => {
    const { container } = render(<GymChip name="CrossFit BullBox" type="gym" href="/storefront/abc" />);
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/storefront/abc');
  });

  it('renders no link when href is omitted', () => {
    const { container } = render(<GymChip name="CrossFit BullBox" type="gym" />);
    expect(container.querySelector('a')).toBeNull();
  });
});
