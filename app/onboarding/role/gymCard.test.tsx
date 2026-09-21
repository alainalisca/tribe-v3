/**
 * T-GYM4: the gym card on /onboarding/role.
 *
 * Every assertion here is on an OUTCOME a user or the database would see --
 * did the flag get written, did navigation happen, where did it land -- never
 * on whether a helper is spelled a particular way. CLAUDE.md: a detector that
 * searches for a NAME answers "is this spelled the way I expected", not "does
 * this do the thing".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));

const getUser = vi.fn();
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));

const showError = vi.fn();
vi.mock('@/lib/toast', () => ({ showError: (m: string) => showError(m) }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/components/LoadingSpinner', () => ({ default: () => <div data-testid="spinner" /> }));

const enableInstructorAccount = vi.fn();
vi.mock('@/lib/dal', () => ({
  enableInstructorAccount: (...args: unknown[]) => enableInstructorAccount(...args),
}));

import OnboardingRolePage from './page';

async function chooseAndContinue(cardText: string) {
  render(<OnboardingRolePage />);
  fireEvent.click(await screen.findByText(cardText));
  fireEvent.click(screen.getByText('Get Started'));
}

describe('the gym card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    enableInstructorAccount.mockResolvedValue({ success: true, data: null });
  });

  it('offers three choices, not two', async () => {
    render(<OnboardingRolePage />);
    expect(await screen.findByText('I Want to Train')).toBeTruthy();
    expect(screen.getByText('I Want to Teach')).toBeTruthy();
    expect(screen.getByText('I Represent a Gym')).toBeTruthy();
  });

  it('writes the account flag BEFORE navigating, and lands on the apply form', async () => {
    await chooseAndContinue('I Represent a Gym');
    await waitFor(() => expect(mockPush).toHaveBeenCalled());

    // Ordering is the requirement: a gym owner who arrives at /partners/apply
    // without the flag hits its "account required" guard.
    expect(enableInstructorAccount).toHaveBeenCalledWith(expect.anything(), 'u1');
    const writeOrder = enableInstructorAccount.mock.invocationCallOrder[0];
    const pushOrder = mockPush.mock.invocationCallOrder[0];
    expect(writeOrder).toBeLessThan(pushOrder);
  });

  it('navigates WITH the trailing slash next.config requires', async () => {
    await chooseAndContinue('I Represent a Gym');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/partners/apply/'));
  });

  it('does not navigate when the write fails, and says so', async () => {
    enableInstructorAccount.mockResolvedValue({ success: false, error: 'no_rows_updated' });
    await chooseAndContinue('I Represent a Gym');
    await waitFor(() => expect(showError).toHaveBeenCalled());
    // The whole point: a failed write must not route the user onward.
    expect(mockPush).not.toHaveBeenCalled();
    expect(showError.mock.calls[0][0]).toMatch(/couldn't save your role/i);
  });

  it('leaves the instructor branch on its own destination', async () => {
    await chooseAndContinue('I Want to Teach');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding/instructor'));
    expect(enableInstructorAccount).toHaveBeenCalledWith(expect.anything(), 'u1');
  });

  it('leaves the athlete branch writing nothing', async () => {
    await chooseAndContinue('I Want to Train');
    // The athlete default is /onboarding/sports since migration 187. This case
    // is about the gym card not disturbing the athlete branch, so what matters
    // is that the branch still routes and still writes nothing.
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding/sports'));
    expect(enableInstructorAccount).not.toHaveBeenCalled();
  });
});
