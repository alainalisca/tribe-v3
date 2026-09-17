import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';

/**
 * Initial language resolution.
 *
 * The bug this guards: users.preferred_language was written by the toggle and
 * read by every server side notification sender, but never read on load, so a
 * user whose account says 'es' opened the app in English and had no way to
 * know the two disagreed.
 *
 * Priority order, and each step has a test below:
 *   1. an explicit choice in this browser
 *   2. users.preferred_language
 *   3. navigator.languages
 *   4. Spanish
 */

const { mockGetUser, mockMaybeSingle, mockUpdateUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockUpdateUser: vi.fn(),
}));

// The table and column are RECORDED, not just accepted. The mock previously
// returned its fixed row whatever the query asked for, so changing
// .select('preferred_language') to .select('id') broke nothing -- proved by
// mutation on 2026-09-17. That matters beyond tidiness: public.users is under
// column-level SELECT grants (066), and PostgREST rejects the WHOLE request when
// a select names an ungranted column, so a wrong column name here is a 401 that
// takes the whole provider down, not a missing field.
const mockFrom = vi.fn();
const mockSelect = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      mockFrom(table);
      return {
        select: (cols: string) => {
          mockSelect(cols);
          return { eq: () => ({ maybeSingle: mockMaybeSingle }) };
        },
      };
    },
  }),
}));
vi.mock('@/lib/dal', () => ({ updateUser: mockUpdateUser }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

import { LanguageProvider, useLanguage } from './LanguageContext';

function Probe() {
  const { language, setLanguage } = useLanguage();
  return (
    <div>
      <span data-testid="lang">{language}</span>
      <button onClick={() => setLanguage('en')}>to-en</button>
    </div>
  );
}

/** Replace navigator.languages, which is read-only in jsdom. */
function setBrowserLanguages(langs: string[]) {
  Object.defineProperty(window.navigator, 'languages', { value: langs, configurable: true });
  Object.defineProperty(window.navigator, 'language', { value: langs[0] ?? '', configurable: true });
}

beforeEach(() => {
  mockFrom.mockClear();
  mockSelect.mockClear();
  vi.clearAllMocks();
  localStorage.clear();
  setBrowserLanguages(['en-US']);
  // Signed in by default, with no stored preference.
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  mockMaybeSingle.mockResolvedValue({ data: { preferred_language: null } });
  mockUpdateUser.mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
});

function renderProvider() {
  return render(
    <LanguageProvider>
      <Probe />
    </LanguageProvider>
  );
}

const lang = () => screen.getByTestId('lang').textContent;

describe('priority 2: the stored account preference', () => {
  it('THE GUARD: a profile with preferred_language es resolves to es, not en', async () => {
    // English browser, empty localStorage, account says Spanish. Before this
    // fix the column was never read and this resolved to 'en'.
    setBrowserLanguages(['en-US']);
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'es' } });

    renderProvider();

    await waitFor(() => expect(lang()).toBe('es'));
  });

  it('caches the resolved preference so the next load needs no query', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'es' } });

    renderProvider();

    await waitFor(() => expect(localStorage.getItem('language')).toBe('es'));
  });

  it('ignores an unrecognised stored value and keeps the browser answer', async () => {
    setBrowserLanguages(['en-US']);
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'pt' } });

    renderProvider();

    await waitFor(() => expect(mockMaybeSingle).toHaveBeenCalled());
    expect(lang()).toBe('en');
  });

  it('leaves the browser answer standing when the profile read fails', async () => {
    setBrowserLanguages(['en-US']);
    mockMaybeSingle.mockRejectedValue(new Error('db down'));

    renderProvider();

    await waitFor(() => expect(mockMaybeSingle).toHaveBeenCalled());
    expect(lang()).toBe('en');
  });

  it('does not query at all for a signed out visitor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    renderProvider();

    await waitFor(() => expect(mockGetUser).toHaveBeenCalled());
    // mockFrom, not just mockMaybeSingle. Asserting only the LAST call in the
    // chain cannot tell an early return from a crash: deleting the
    // `if (!data.user) return null` guard makes the code call .from() and
    // .select() and then throw on `undefined.id`, so maybeSingle is still never
    // reached and the old assertion still passed. Proved by mutation
    // 2026-09-17. from() is the earliest observable point, so it is the one
    // that distinguishes "did not query" from "query blew up".
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });
});

describe('priority 1: an explicit choice outranks the account', () => {
  it('a saved localStorage choice wins and skips the query entirely', async () => {
    localStorage.setItem('language', 'en');
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'es' } });

    renderProvider();

    await waitFor(() => expect(lang()).toBe('en'));
    // The whole point of tier 1: a settled device costs nothing.
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('a toggle made while the profile read is in flight is not overwritten', async () => {
    setBrowserLanguages(['es-CO']);
    let resolvePreference: (v: { data: { preferred_language: string } }) => void = () => {};
    mockMaybeSingle.mockReturnValue(
      new Promise((resolve) => {
        resolvePreference = resolve;
      })
    );

    renderProvider();
    await waitFor(() => expect(lang()).toBe('es'));

    // The user picks English before the account preference lands.
    fireEvent.click(screen.getByText('to-en'));
    expect(lang()).toBe('en');

    await act(async () => {
      resolvePreference({ data: { preferred_language: 'es' } });
    });

    expect(lang()).toBe('en');
  });
});

describe('priority 3 and 4: the browser, then Spanish', () => {
  it('resolves es for a Spanish browser', async () => {
    setBrowserLanguages(['es-CO', 'es']);

    renderProvider();

    await waitFor(() => expect(lang()).toBe('es'));
  });

  it('resolves en for an English browser, so the public pages stay English', async () => {
    setBrowserLanguages(['en-GB', 'en']);

    renderProvider();

    await waitFor(() => expect(lang()).toBe('en'));
  });

  it('falls back to Spanish when the browser gives nothing usable', async () => {
    setBrowserLanguages(['pt-BR', 'fr']);

    renderProvider();

    await waitFor(() => expect(lang()).toBe('es'));
  });
});

describe('the toggle still persists to the column', () => {
  it('writes preferred_language on an explicit change', async () => {
    localStorage.setItem('language', 'es');

    renderProvider();
    await waitFor(() => expect(lang()).toBe('es'));

    fireEvent.click(screen.getByText('to-en'));

    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith(expect.anything(), 'u1', { preferred_language: 'en' })
    );
  });
});

describe('document language', () => {
  it('sets the html lang attribute to match the resolved language', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'es' } });

    renderProvider();

    await waitFor(() => expect(document.documentElement.lang).toBe('es'));
  });
});

describe('the profile read itself', () => {
  it('asks public.users for preferred_language by name', async () => {
    // Without this, the column name is unpinned: the mock answers any select,
    // so swapping preferred_language for another column passes every other test
    // in this file while the feature silently stops working in production.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'es' } });

    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>
    );

    await waitFor(() => expect(mockSelect).toHaveBeenCalled());
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockSelect).toHaveBeenCalledWith('preferred_language');
  });
});
