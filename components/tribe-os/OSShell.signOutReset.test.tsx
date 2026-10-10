/**
 * T-ANALYTICS1 part B: signing out of Tribe.OS detaches the PostHog identity
 * BEFORE the Supabase session goes, so the next person on a shared gym-front
 * device is not merged into the previous account.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/os/dashboard' }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('./OSShellBell', () => ({ default: () => null }));
vi.mock('./PwaInstallPrompt', () => ({ default: () => null }));
vi.mock('@/lib/dal/tribeOSPremium', () => ({ getTribeOSPremiumStatusForUser: vi.fn() }));

// getUser never settles, so the shell stays in its initial 'unknown' state,
// which renders the full chrome and the Sign Out button.
const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: () => new Promise(() => {}), signOut } }),
}));

const resetUser = vi.fn();
vi.mock('@/lib/analytics', () => ({ resetUser: () => resetUser(), trackEvent: vi.fn() }));

import OSShell from './OSShell';

describe('OSShell sign out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  it('resets the PostHog identity, then signs out', async () => {
    render(
      <OSShell>
        <p>page</p>
      </OSShell>
    );
    fireEvent.click(await screen.findByText('Sign Out'));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(resetUser).toHaveBeenCalledOnce();
    expect(resetUser.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
  });
});
