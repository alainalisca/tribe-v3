import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { showSuccess } from '@/lib/toast';
import { logError } from '@/lib/logger';
import { paySheetDecision, usePaySheet } from './usePaySheet';

const INSTRUCTIONS = 'Nequi 300 123 4567 o paga aquí: https://example.com/pago';

describe('paySheetDecision', () => {
  it('opens for a pending athlete with instructions', () => {
    expect(paySheetDecision({ isPending: true, paymentInstructions: INSTRUCTIONS })).toEqual({ open: true });
  });

  it.each([
    [{ isPending: false, paymentInstructions: INSTRUCTIONS }, 'not pending after reload'],
    [{ isPending: true, paymentInstructions: null }, 'instructions not loaded'],
    [{ isPending: true, paymentInstructions: '   ' }, 'instructions empty'],
  ])('stays shut for %o', (input, reason) => {
    expect(paySheetDecision(input)).toEqual({ open: false, reason });
  });
});

describe('usePaySheet', () => {
  beforeEach(() => vi.clearAllMocks());

  const base = { isPending: true, paymentInstructions: INSTRUCTIONS, language: 'es' as const, sessionId: 's-1' };

  it('is closed on a visit with no request, even when pending with instructions (later visits)', () => {
    const { result } = renderHook(() => usePaySheet(base));
    expect(result.current.open).toBe(false);
  });

  it('opens once after a paid request, without the toast, and closes', () => {
    const { result } = renderHook(() => usePaySheet(base));
    act(() => result.current.onPaidRequestSent());
    expect(result.current.open).toBe(true);
    expect(showSuccess).not.toHaveBeenCalled();
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
  });

  it('does not reopen on its own after being closed', () => {
    const { result, rerender } = renderHook((p) => usePaySheet(p), { initialProps: base });
    act(() => result.current.onPaidRequestSent());
    act(() => result.current.close());
    rerender({ ...base, paymentInstructions: `${INSTRUCTIONS} ` });
    expect(result.current.open).toBe(false);
  });

  it('falls back to the toast and logs when the instructions did not load', () => {
    const { result } = renderHook(() => usePaySheet({ ...base, paymentInstructions: null }));
    act(() => result.current.onPaidRequestSent());
    expect(result.current.open).toBe(false);
    expect(showSuccess).toHaveBeenCalledWith(
      '¡Solicitud enviada! Paga al instructor directamente y confirmará tu lugar.'
    );
    expect(logError).toHaveBeenCalledWith(expect.any(Error), { action: 'usePaySheet', sessionId: 's-1' });
  });

  it('falls back to the toast when the athlete is not pending after the reload', () => {
    const { result } = renderHook(() => usePaySheet({ ...base, isPending: false }));
    act(() => result.current.onPaidRequestSent());
    expect(result.current.open).toBe(false);
    expect(showSuccess).toHaveBeenCalledTimes(1);
  });
});
