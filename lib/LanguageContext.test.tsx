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
  // T-SITE1: the tribe_lang cookie is the choice's other home; jsdom keeps
  // document.cookie across tests, so it is cleared with localStorage.
  document.cookie = 'tribe_lang=; Path=/; Max-Age=0';
  setBrowserLanguages(['en-US']);
  // Signed in by default, with no stored preference. T-SITE1: the provider only
  // asks the account when a Supabase auth cookie exists, so "signed in" includes
  // the cookie.
  document.cookie = 'sb-test-auth-token=x; Path=/';
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

/** A stored value counts only when the person chose it (T-LANG1, preferred_language_set_at). */
const CHOSE = '2026-10-20T12:00:00Z';

describe('priority 2: the stored account preference', () => {
  it("T-LANG1: a stored 'en' nobody chose is ignored; the browser decides", async () => {
    // The column defaulted to 'en' for every account. Without a set_at it is
    // not a choice, so a Spanish browser stays Spanish.
    setBrowserLanguages(['es-CO']);
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'en', preferred_language_set_at: null } });

    renderProvider();

    await waitFor(() => expect(mockMaybeSingle).toHaveBeenCalled());
    expect(lang()).toBe('es');
    expect(localStorage.getItem('language')).not.toBe('en');
  });

  it('THE GUARD: a profile with preferred_language es resolves to es, not en', async () => {
    // English browser, empty localStorage, account says Spanish. Before this
    // fix the column was never read and this resolved to 'en'.
    setBrowserLanguages(['en-US']);
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'es', preferred_language_set_at: CHOSE } });

    renderProvider();

    await waitFor(() => expect(lang()).toBe('es'));
  });

  it('caches the resolved preference so the next load needs no query', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'es', preferred_language_set_at: CHOSE } });

    renderProvider();

    await waitFor(() => expect(localStorage.getItem('language')).toBe('es'));
  });

  it('ignores an unrecognised stored value and keeps the browser answer', async () => {
    setBrowserLanguages(['en-US']);
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'pt', preferred_language_set_at: CHOSE } });

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

  it('a visitor with no auth cookie never loads supabase-js for this (T-SITE1)', async () => {
    document.cookie = 'sb-test-auth-token=; Path=/; Max-Age=0';
    setBrowserLanguages(['es-CO']);

    renderProvider();

    await waitFor(() => expect(lang()).toBe('es'));
    await new Promise((r) => setTimeout(r, 20));
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
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
  it('the tribe_lang cookie (the site toggle) wins over localStorage and skips the query', async () => {
    document.cookie = 'tribe_lang=es; Path=/';
    localStorage.setItem('language', 'en');
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'en', preferred_language_set_at: CHOSE } });

    renderProvider();

    await waitFor(() => expect(lang()).toBe('es'));
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('copies an older localStorage choice into the cookie, so the site follows it', async () => {
    localStorage.setItem('language', 'en');

    renderProvider();

    await waitFor(() => expect(lang()).toBe('en'));
    expect(document.cookie).toContain('tribe_lang=en');
  });

  it('writes the cookie on an explicit change', async () => {
    setBrowserLanguages(['es-CO']);
    renderProvider();
    await waitFor(() => expect(lang()).toBe('es'));

    fireEvent.click(screen.getByText('to-en'));

    expect(document.cookie).toContain('tribe_lang=en');
    expect(localStorage.getItem('language')).toBe('en');
  });

  it('does not write the cookie for a browser-locale guess', async () => {
    setBrowserLanguages(['en-US']);
    mockGetUser.mockResolvedValue({ data: { user: null } });

    renderProvider();

    await waitFor(() => expect(lang()).toBe('en'));
    expect(document.cookie).not.toContain('tribe_lang=');
  });

  it('a saved localStorage choice wins and skips the query entirely', async () => {
    localStorage.setItem('language', 'en');
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'es', preferred_language_set_at: CHOSE } });

    renderProvider();

    await waitFor(() => expect(lang()).toBe('en'));
    // The whole point of tier 1: a settled device costs nothing.
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('a toggle made while the profile read is in flight is not overwritten', async () => {
    setBrowserLanguages(['es-CO']);
    let resolvePreference: (v: {
      data: { preferred_language: string; preferred_language_set_at: string };
    }) => void = () => {};
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
      resolvePreference({ data: { preferred_language: 'es', preferred_language_set_at: CHOSE } });
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
      expect(mockUpdateUser).toHaveBeenCalledWith(expect.anything(), 'u1', {
        preferred_language: 'en',
        preferred_language_set_at: expect.any(String),
      })
    );
  });
});

describe('document language', () => {
  it('sets the html lang attribute to match the resolved language', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'es', preferred_language_set_at: CHOSE } });

    renderProvider();

    await waitFor(() => expect(document.documentElement.lang).toBe('es'));
  });
});

describe('the profile read itself', () => {
  it('asks public.users for preferred_language and its set_at by name', async () => {
    // Without this, the column name is unpinned: the mock answers any select,
    // so swapping preferred_language for another column passes every other test
    // in this file while the feature silently stops working in production.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockMaybeSingle.mockResolvedValue({ data: { preferred_language: 'es', preferred_language_set_at: CHOSE } });

    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>
    );

    await waitFor(() => expect(mockSelect).toHaveBeenCalled());
    expect(mockFrom).toHaveBeenCalledWith('users');
    expect(mockSelect).toHaveBeenCalledWith('preferred_language, preferred_language_set_at');
  });
});
