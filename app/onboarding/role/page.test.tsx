/**
 * T-C1 Gate 2: the athlete branch of role onboarding consumes the parked
 * returnTo — the end of the invite → signup → onboarding → invite loop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const getUser = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/components/LoadingSpinner', () => ({ default: () => <div data-testid="spinner" /> }));

import OnboardingRolePage from './page';

const STORAGE_KEY = 'tribe_pending_return_to';
const INVITE_PATH = '/invite/abc123def456';

async function chooseAthleteAndContinue() {
  render(<OnboardingRolePage />);
  const athleteCard = await screen.findByText('I Want to Train');
  fireEvent.click(athleteCard);
  fireEvent.click(screen.getByText('Get Started'));
  await waitFor(() => expect(mockPush).toHaveBeenCalled());
}

describe('OnboardingRolePage — returnTo consumption (T-C1 Gate 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('athlete completion lands on the parked returnTo and clears it', async () => {
    sessionStorage.setItem(STORAGE_KEY, INVITE_PATH);
    await chooseAthleteAndContinue();
    expect(mockPush).toHaveBeenCalledWith(INVITE_PATH);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  /**
   * DEFER, NOT SKIP -- first half. A share-link athlete reaches the SESSION
   * first; the invite wins over the sports step. The second half, being asked
   * for sports immediately after joining it, is in
   * hooks/useSessionActions.deferredSportsStep.test.ts.
   *
   * This is a distinct case from the invite one above, and deliberately so:
   * the value that must win is now a /session path, which is the exact shape
   * the deferred ask sends back as its returnTo. A rule that happened to
   * special-case /invite would pass that test and fail this one.
   */
  it('a share-link athlete goes to the SESSION, not to the sports step', async () => {
    sessionStorage.setItem(STORAGE_KEY, '/session/sess-1');
    await chooseAthleteAndContinue();
    expect(mockPush).toHaveBeenCalledWith('/session/sess-1');
    expect(mockPush).not.toHaveBeenCalledWith('/onboarding/sports');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('athlete completion falls back to the sports step when nothing is parked', async () => {
    await chooseAthleteAndContinue();
    expect(mockPush).toHaveBeenCalledWith('/onboarding/sports');
  });

  it('a tampered parked value falls back to the sports step and is cleared', async () => {
    sessionStorage.setItem(STORAGE_KEY, '//evil.com/phish');
    await chooseAthleteAndContinue();
    expect(mockPush).toHaveBeenCalledWith('/onboarding/sports');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
