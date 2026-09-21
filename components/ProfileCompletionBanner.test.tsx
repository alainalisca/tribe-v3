/**
 * The home-feed prompt for athletes with an empty profile (2026-09-21).
 *
 * Measured on the live database: of 60 non-test athletes, 28 have neither
 * sports nor a photo and 6 have a photo but no sports. Sports is both the more
 * common gap and the load-bearing one -- find_training_partners ranks on it and
 * /instructors filters by it, so an athlete with no sports is invisible to both.
 *
 * This banner already existed and already fired for all 28. It led with the
 * PHOTO and sent sports to /profile/edit as a secondary text link, where sports
 * is one row in a form of optional fields. These tests hold the ordering and
 * the destination, which is the whole of what changed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const dismiss = vi.fn();
let state = { dismissed: false, loading: false };
vi.mock('@/hooks/useBannerDismissal', () => ({
  BANNER_IDS: { profileCompletion: 'profile_completion' },
  useBannerDismissal: () => ({ ...state, dismiss }),
}));
vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (k: string) => k }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import ProfileCompletionBanner from './ProfileCompletionBanner';

/** The link whose text is `label`, or undefined. Asserting on the HREF is the
 *  point: "an ask for sports exists" was true before this change too. */
const hrefOf = (label: string | RegExp) => screen.queryByRole('link', { name: label })?.getAttribute('href');

beforeEach(() => {
  state = { dismissed: false, loading: false };
  dismiss.mockClear();
});

describe('sports leads, and it leads to the one screen', () => {
  it('NON-VACUITY: the banner renders at all for an empty profile', () => {
    render(<ProfileCompletionBanner hasPhoto={false} hasSports={false} hasName />);
    // Without this, every queryBy* below is satisfied by a blank document.
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeTruthy();
  });

  it('the 28: no sports and no photo leads with SPORTS, not the photo', () => {
    render(<ProfileCompletionBanner hasPhoto={false} hasSports={false} hasName />);
    expect(screen.getByText(/choose your sports/i)).toBeTruthy();
    expect(screen.queryByText(/add a profile photo so/i)).toBeNull();
  });

  it('the sports CTA goes to the one screen, not to the fifteen-field form', () => {
    render(<ProfileCompletionBanner hasPhoto={false} hasSports={false} hasName />);
    expect(hrefOf(/choose sports/i)).toBe('/onboarding/sports');
  });

  it('the photo stays offered as a secondary ask, so the 28 lose nothing', () => {
    render(<ProfileCompletionBanner hasPhoto={false} hasSports={false} hasName />);
    expect(hrefOf('addPhoto')).toBe('/profile/edit');
  });

  it('the 6 with a photo but no sports still get the sports lead', () => {
    render(<ProfileCompletionBanner hasPhoto hasSports={false} hasName />);
    expect(screen.getByText(/choose your sports/i)).toBeTruthy();
    expect(hrefOf(/choose sports/i)).toBe('/onboarding/sports');
  });

  it('sports present and photo missing falls back to the photo lead', () => {
    render(<ProfileCompletionBanner hasPhoto={false} hasSports hasName />);
    expect(screen.getByText(/add a profile photo so/i)).toBeTruthy();
    expect(screen.queryByText(/choose your sports/i)).toBeNull();
  });

  it('a complete profile renders nothing', () => {
    const { container } = render(<ProfileCompletionBanner hasPhoto hasSports hasName />);
    expect(container.innerHTML).toBe('');
  });

  /** Dismissal is permanent and server-side (T-ONB1). An athlete among the 28
   *  who dismissed this before today never sees the new ask, which is why a
   *  one-time push is queued separately rather than relying on this banner. */
  it('a previous dismissal still suppresses it', () => {
    state = { dismissed: true, loading: false };
    const { container } = render(<ProfileCompletionBanner hasPhoto={false} hasSports={false} hasName />);
    expect(container.innerHTML).toBe('');
  });

  it('unknown dismissal state renders nothing rather than guessing', () => {
    state = { dismissed: false, loading: true };
    const { container } = render(<ProfileCompletionBanner hasPhoto={false} hasSports={false} hasName />);
    expect(container.innerHTML).toBe('');
  });
});
