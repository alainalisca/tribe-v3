/**
 * T-AUD13, live half: all three trust-bar tiles printed an em dash when empty.
 *
 * Em dashes are banned across the product. But the replacement is not one
 * substitution, because the three tiles were empty in three different ways:
 *
 *   Rating        absent until someone reviews. "0.0" asserts a bad rating
 *                 nobody gave.
 *   Sessions led  a MEASURED zero since migration 148 made the counter real.
 *                 "0 sessions led" is a true statement; the dash destroyed it.
 *   Years         self-reported and optional. Empty means unstated, not zero.
 *
 * Rendered assertions, not source ones: the defect is what a visitor sees on an
 * instructor's public page.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StorefrontTrustBar from './StorefrontTrustBar';
import type { Instructor } from '@/app/storefront/[id]/useStorefrontData';

const DASHES = /[—–]/;

function make(overrides: Partial<Instructor> = {}): Instructor {
  return {
    id: 'i1',
    name: 'Caroline',
    average_rating: null,
    total_reviews: 0,
    total_sessions_hosted: 0,
    years_experience: null,
    ...overrides,
  } as Instructor;
}

describe('T-AUD13 trust bar renders no em dash', () => {
  it('renders no dash when every value is empty', () => {
    const { container } = render(<StorefrontTrustBar instructor={make()} language="en" />);
    expect(container.textContent ?? '').not.toMatch(DASHES);
  });

  it('renders no dash in the vertical orientation either', () => {
    const { container } = render(<StorefrontTrustBar instructor={make()} language="en" orientation="vertical" />);
    expect(container.textContent ?? '').not.toMatch(DASHES);
  });

  it('renders no dash in Spanish', () => {
    const { container } = render(<StorefrontTrustBar instructor={make()} language="es" />);
    expect(container.textContent ?? '').not.toMatch(DASHES);
  });
});

describe('T-AUD13 the three empties are treated as the different facts they are', () => {
  it('a MEASURED zero renders as 0: sessions led is a real counter since 148', () => {
    render(<StorefrontTrustBar instructor={make({ total_sessions_hosted: 0 })} language="en" />);
    expect(screen.getByText('Sessions led')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('an ABSENT rating omits the tile rather than claiming 0.0', () => {
    const { container } = render(
      <StorefrontTrustBar instructor={make({ total_reviews: 0, average_rating: null })} language="en" />
    );
    expect(screen.queryByText('Rating')).toBeNull();
    expect(container.textContent ?? '').not.toContain('0.0');
  });

  it('an ABSENT years value omits the tile rather than claiming zero experience', () => {
    render(<StorefrontTrustBar instructor={make({ years_experience: null })} language="en" />);
    expect(screen.queryByText('Years of experience')).toBeNull();
  });

  it('shows all three once all three are real', () => {
    render(
      <StorefrontTrustBar
        instructor={make({ total_reviews: 2, average_rating: 5, total_sessions_hosted: 7, years_experience: 4 })}
        language="en"
      />
    );
    expect(screen.getByText('5.0')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });
});
