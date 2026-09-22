/**
 * The sports step sends the athlete back where they came from.
 *
 * The deferred ask (hooks/useSessionActions.deferredSportsStep.test.ts) passes
 * ?returnTo=/session/<id> so a share-link athlete lands back on the session
 * they were invited to rather than on the feed. Without this the defer is a
 * detour with no way home, which is worse than the skip it replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockReplace = vi.fn();
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => params,
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/components/onboarding/AvatarUploadField', () => ({ default: () => <div /> }));
vi.mock('@/lib/dal/athleteSetup', () => ({ completeAthleteSetup: vi.fn() }));

import AthleteSportsStep from './page';
import { completeAthleteSetup } from '@/lib/dal/athleteSetup';

async function pickASportAndContinue() {
  render(<AthleteSportsStep />);
  fireEvent.click(await screen.findByText('Running'));
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
  await waitFor(() => expect(completeAthleteSetup).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  params = new URLSearchParams();
  vi.mocked(completeAthleteSetup).mockResolvedValue({ success: true, data: null });
});

describe('the sports step honours returnTo', () => {
  it('NON-VACUITY: the sport chip is reachable and Continue saves', async () => {
    await pickASportAndContinue();
    expect(completeAthleteSetup).toHaveBeenCalledWith(expect.anything(), ['Running']);
  });

  it('a parked session brings the athlete back to it', async () => {
    params = new URLSearchParams('returnTo=%2Fsession%2Fsess-1');
    await pickASportAndContinue();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/session/sess-1'));
  });

  it('no returnTo lands on the feed', async () => {
    await pickASportAndContinue();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  /** Same rule as every other returnTo in the app, imported rather than
   *  re-implemented -- a second copy is the one that misses a backslash. */
  it('an off-origin returnTo collapses to the feed', async () => {
    params = new URLSearchParams('returnTo=%2F%5Cevil.com');
    await pickASportAndContinue();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockReplace).not.toHaveBeenCalledWith('/\\evil.com');
  });

  it('a failed save does not navigate anywhere', async () => {
    params = new URLSearchParams('returnTo=%2Fsession%2Fsess-1');
    vi.mocked(completeAthleteSetup).mockResolvedValue({ success: false, error: 'at least one sport is required' });
    await pickASportAndContinue();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
