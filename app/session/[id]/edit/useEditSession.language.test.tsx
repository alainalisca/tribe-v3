/**
 * "Las sesiones pasadas no se pueden editar" came up in English on a full page
 * load of /session/<id>/edit for a Spanish speaker. The loader starts once, on
 * mount, before LanguageProvider has applied the saved language (a child's
 * effects run before its parent's), and it showed its toasts in the language
 * it started with. Here the language changes while the session is loading, as
 * it does on a real load, and the toast must come out in the new one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { getEditSessionTranslations } from './translations';

const { showError, replace, fetchSession } = vi.hoisted(() => ({
  showError: vi.fn(),
  replace: vi.fn(),
  fetchSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, back: vi.fn(), push: vi.fn() }),
  useParams: () => ({ id: 's1' }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'host' } } }) } }),
}));
vi.mock('@/lib/toast', () => ({ showError, showSuccess: vi.fn() }));
vi.mock('@/lib/dal', () => ({
  fetchSession,
  fetchSessionFields: vi.fn(),
  fetchSessionPaymentInstructions: vi.fn(),
  fetchConfirmedCount: vi.fn(),
  fetchUserProfile: vi.fn(),
  updateSessionAsHost: vi.fn(),
}));
vi.mock('@/lib/dal/gymVenue', () => ({ fetchPartnersByIds: vi.fn() }));
vi.mock('@/components/ConfirmProvider', () => ({ useConfirm: () => vi.fn() }));
vi.mock('@/hooks/useVenuePicker', () => ({ useVenuePicker: () => ({ select: vi.fn() }) }));
vi.mock('@/lib/i18n/useTranslations', () => ({ useTranslations: () => (k: string) => k }));
vi.mock('@/components/session-form/useFieldErrorText', () => ({ useFieldErrorText: () => (k: string) => k }));

import { useEditSession } from './useEditSession';

/** A one-off session that has already happened: the edit page refuses it. */
const past = {
  id: 's1',
  creator_id: 'host',
  date: '2026-01-10',
  start_time: '07:00',
  duration: 60,
  is_recurring: false,
};
const other = { ...past, creator_id: 'someone-else' };

/** Resolve the session read only when the test says so. */
function heldRead(session: object) {
  let release: () => void = () => {};
  fetchSession.mockReturnValue(
    new Promise((resolve) => {
      release = () => resolve({ success: true, data: session });
    })
  );
  return () => release();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the edit page toasts in the language the page settles on', () => {
  for (const [label, session, key] of [
    ['a past session', past, 'pastLocked'],
    ["someone else's session", other, 'notOwner'],
  ] as const) {
    it(`${label}: Spanish once the saved choice lands, though the load started in English`, async () => {
      const release = heldRead(session);
      const { rerender } = renderHook(({ lang }) => useEditSession(lang, getEditSessionTranslations(lang)), {
        initialProps: { lang: 'en' as 'en' | 'es' },
      });
      await waitFor(() => expect(fetchSession).toHaveBeenCalled());

      // LanguageProvider applies the saved 'es' while the read is in flight.
      rerender({ lang: 'es' });
      release();

      await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
      expect(showError).toHaveBeenCalledWith(getEditSessionTranslations('es')[key]);
      expect(replace).toHaveBeenCalledWith('/session/s1');
    });
  }
});
