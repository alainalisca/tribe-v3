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

  it('athlete completion falls back to /profile/edit when nothing is parked', async () => {
    await chooseAthleteAndContinue();
    expect(mockPush).toHaveBeenCalledWith('/profile/edit');
  });

  it('a tampered parked value falls back to /profile/edit and is cleared', async () => {
    sessionStorage.setItem(STORAGE_KEY, '//evil.com/phish');
    await chooseAthleteAndContinue();
    expect(mockPush).toHaveBeenCalledWith('/profile/edit');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
