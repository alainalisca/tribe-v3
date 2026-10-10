/**
 * T-ANALYTICS1 part B: signup_completed fires from /onboarding/role once the
 * role is SAVED, for every signup method, with the role the person chose.
 *
 * The event used to fire on the email form POST -- before verification, before
 * any role -- and never for Google or Apple. The failure case below is the one
 * that matters most: a role write that fails must not be counted as a signup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: vi.fn() }) }));

const user = { id: 'u1', created_at: '2026-10-10T10:00:00Z', app_metadata: { provider: 'apple' } };
const getUser = vi.fn();
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/components/LoadingSpinner', () => ({ default: () => <div data-testid="spinner" /> }));

const enableInstructorAccount = vi.fn();
vi.mock('@/lib/dal', () => ({
  enableInstructorAccount: (...args: unknown[]) => enableInstructorAccount(...args),
}));

const recordSignupCompleted = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/analyticsIdentity', () => ({
  recordSignupCompleted: (...args: unknown[]) => recordSignupCompleted(...args),
}));

import OnboardingRolePage from './page';

async function chooseAndContinue(cardText: string) {
  render(<OnboardingRolePage />);
  fireEvent.click(await screen.findByText(cardText));
  fireEvent.click(screen.getByText('Get Started'));
}

describe('signup_completed on /onboarding/role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    getUser.mockResolvedValue({ data: { user } });
    enableInstructorAccount.mockResolvedValue({ success: true, data: null });
  });

  it.each([
    ['I Want to Train', 'athlete'],
    ['I Want to Teach', 'instructor'],
    ['I Represent a Gym', 'gym'],
  ])('%s records the signup as %s, for the signed-in user', async (card, role) => {
    await chooseAndContinue(card);
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(recordSignupCompleted).toHaveBeenCalledOnce();
    expect(recordSignupCompleted).toHaveBeenCalledWith(expect.anything(), user, role);
  });

  it('records it only AFTER the role write succeeded', async () => {
    await chooseAndContinue('I Want to Teach');
    await waitFor(() => expect(recordSignupCompleted).toHaveBeenCalled());
    expect(enableInstructorAccount.mock.invocationCallOrder[0]).toBeLessThan(
      recordSignupCompleted.mock.invocationCallOrder[0]
    );
  });

  it('does not record a signup when the role write fails', async () => {
    enableInstructorAccount.mockResolvedValue({ success: false, error: 'no_rows_updated' });
    await chooseAndContinue('I Represent a Gym');
    await waitFor(() => expect(enableInstructorAccount).toHaveBeenCalled());
    expect(recordSignupCompleted).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
