import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import AppStoreBanner from './IOSInstallPrompt';

/**
 * NAV-02 / T-GYM3b.
 *
 * A stranger arriving from an Instagram bio must see the gym, not a full-screen
 * store modal three seconds in. These assert BOTH halves: the modal stays away
 * on the share routes AND still appears everywhere else, because a suppression
 * that leaks would silently delete the install funnel and no other test in this
 * repo would notice.
 */

let mockPathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'en' }) }));

function setMobileUserAgent() {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    configurable: true,
  });
}

/** Render, then run past the component's own 3s delay. */
function renderAndAdvance() {
  render(<AppStoreBanner />);
  act(() => {
    vi.advanceTimersByTime(4000);
  });
}

describe('AppStoreBanner route suppression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    setMobileUserAgent();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    ['/g/bullbox/', 'a gym bio link'],
    ['/g/040cbc21-1b11-4ae1-aa99-9fe35a32bda0/', 'a gym bio link by UUID'],
    ['/i/eaff348f-5df3-4df5-bd80-69ec233aad0e/', 'an instructor share link'],
    ['/invite/abc123', 'an invite link'],
    // T-GYM4's funnel: an install wall here sends a gym owner to the App Store
    // in the middle of creating the account they came to create.
    ['/auth/', 'the sign-in screen'],
    ['/onboarding/role/', 'the role picker'],
    ['/partners/apply/', 'the gym application form'],
  ])('stays hidden on %s (%s)', (pathname) => {
    mockPathname = pathname;
    renderAndAdvance();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    ['/home'],
    ['/sessions'],
    ['/storefront/040cbc21-1b11-4ae1-aa99-9fe35a32bda0/'],
    // Not a share route despite the leading letter: the prefixes require the
    // following slash, so nothing else is swept up.
    ['/instructors'],
    ['/groups/1'],
    // shares a prefix with a suppressed route without being one
    ['/partners'],
  ])('still appears on %s, so the install funnel is untouched', (pathname) => {
    mockPathname = pathname;
    renderAndAdvance();
    expect(screen.queryByRole('dialog')).not.toBeNull();
  });
});
