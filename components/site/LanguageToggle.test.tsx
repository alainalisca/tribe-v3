import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const setLanguage = vi.fn();
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es', setLanguage }) }));

import LanguageToggle from './LanguageToggle';

/**
 * T-SITE1: one tap swaps the language on the first paint. The toggle writes the
 * cookie, refetches the page past the browser cache, then navigates to the same
 * URL, so no cache can hand back the page in the old language.
 */
describe('LanguageToggle', () => {
  const assign = vi.fn();
  const fetchMock = vi.fn();

  beforeEach(() => {
    assign.mockReset();
    setLanguage.mockReset();
    fetchMock.mockReset().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { pathname: '/coaches/', search: '?src=ig', hash: '#planes', assign });
    document.cookie = 'tribe_lang=es; path=/';
  });

  it('writes the cookie, refetches past the cache, then navigates to the same URL without the hash', async () => {
    render(<LanguageToggle current="es" />);
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/coaches/?src=ig'));
    expect(document.cookie).toContain('tribe_lang=en');
    expect(fetchMock).toHaveBeenCalledWith('/coaches/?src=ig', { cache: 'reload', credentials: 'same-origin' });
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(assign.mock.invocationCallOrder[0]);
    expect(setLanguage).toHaveBeenCalledWith('en');
  });

  it('still navigates when the refetch fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    render(<LanguageToggle current="es" />);
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/coaches/?src=ig'));
  });

  it('does nothing on the current language', () => {
    render(<LanguageToggle current="es" />);
    fireEvent.click(screen.getByRole('button', { name: 'ES' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
