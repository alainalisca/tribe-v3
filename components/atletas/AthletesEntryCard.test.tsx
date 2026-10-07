/**
 * T-AV24: the two entry cards. Profile needs only the flag; Home needs the
 * flag AND an active program row (/api/atletas/home-card). Both fail closed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
import AthletesEntryCard from './AthletesEntryCard';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('AthletesEntryCard', () => {
  it('profile: shows when the flag is on, and asks only the flag endpoint', async () => {
    fetchMock.mockReturnValue(answer(200, { enabled: true, features: null }));
    render(<AthletesEntryCard where="profile" />);
    await waitFor(() => expect(screen.getByText('Atletas Tribe')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith('/api/features/athlete-value/?feature=athletes', expect.anything());
    // next.config's trailingSlash is not applied under vitest, so the slash is
    // not asserted here; the destination is.
    expect(screen.getByRole('link').getAttribute('href')?.replace(/\/$/, '')).toBe('/atletas');
  });

  it('home: shows only for { active: true }, and asks only the home-card endpoint', async () => {
    fetchMock.mockReturnValue(answer(200, { active: true }));
    render(<AthletesEntryCard where="home" />);
    await waitFor(() => expect(screen.getByText('Mira tu link y tus invitados.')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith('/api/atletas/home-card/', expect.anything());
  });

  it('home: a flag-on user with no active program sees nothing', async () => {
    fetchMock.mockReturnValue(answer(200, { active: false }));
    const { container } = render(<AthletesEntryCard where="home" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('fails closed: a 404 (flag off), a non-boolean, or a network error shows nothing', async () => {
    const cases: Array<['profile' | 'home', () => Promise<Response>]> = [
      ['profile', () => answer(404, { success: false })],
      ['home', () => answer(404, { success: false })],
      ['home', () => answer(200, { active: 'yes' })],
      ['profile', () => Promise.reject(new Error('offline'))],
    ];
    for (const [where, reply] of cases) {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetchMock.mockImplementationOnce(reply);
      const { container, unmount } = render(<AthletesEntryCard where={where} />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(container.innerHTML).toBe('');
      unmount();
      spy.mockRestore();
      fetchMock.mockClear();
    }
  });
});
