import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTranslations } from './useTranslations';

/**
 * The dev-only warning on pick()'s fallback.
 *
 * WHY IT IS NEEDED ALONGSIDE the static guard in i18nGuards.test.ts: that guard
 * fails CI but can only see LITERAL keys. Nine call sites pass a variable --
 * t(weather.condition), tPartner(typeKey) and the rest -- and a runtime check is
 * the only thing that can see those. T-AUD3 shipped precisely because an
 * unresolved lookup renders the key and says nothing.
 */

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('unresolved-key warning', () => {
  it('warns, and names the namespace and key, when a lookup falls through', () => {
    const { result } = renderHook(() => useTranslations('instructorIncomplete'));
    const out = result.current('definitely-not-a-key');

    // The fallback behaviour is unchanged: the key still renders, because a
    // missing string must never blank the UI.
    expect(out).toBe('definitely-not-a-key');

    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0][0]);
    expect(msg).toContain('instructorIncomplete');
    expect(msg).toContain('definitely-not-a-key');
  });

  it('explains the dotted-key case specifically, since that was T-AUD3', () => {
    renderHook(() => useTranslations('instructorIncomplete')).result.current('fields.photo');

    const msg = String(warn.mock.calls[0][0]);
    // Not just "missing" -- it must say HOW to address a nested message, or the
    // next person repeats the bug.
    expect(msg).toContain("useTranslations('instructorIncomplete.fields')");
    expect(msg).toContain("t('photo')");
  });

  it('stays SILENT for a key that resolves', () => {
    const { result } = renderHook(() => useTranslations('instructorIncomplete'));
    expect(result.current('title')).toBe('Complete your instructor profile');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once per key, so a list does not flood the console', () => {
    const { result } = renderHook(() => useTranslations('instructorIncomplete'));
    result.current('repeated-missing-key');
    result.current('repeated-missing-key');
    result.current('repeated-missing-key');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
