'use client';

/**
 * T-PAY2 Step 5: when to open the post-request payment sheet.
 *
 * Opens ONCE, right after the athlete sends a paid request and the page has
 * reloaded them into pending with the gated instructions. Nothing persists, so
 * a later visit or reload never reopens it; only the pinned bar shows then.
 *
 * If the reload did not leave the athlete pending with non-empty instructions
 * (the instructions failed to load, or are empty), the sheet stays shut and
 * the T-PAY1 toast is shown instead, with the reason logged.
 */

import { useEffect, useState } from 'react';
import { showSuccess } from '@/lib/toast';
import { logError } from '@/lib/logger';
import { paidRequestSentMessage } from '@/hooks/sessionActionTypes';

export type PaySheetDecision = { open: true } | { open: false; reason: string };

export function paySheetDecision({
  isPending,
  paymentInstructions,
}: {
  isPending: boolean;
  paymentInstructions: string | null;
}): PaySheetDecision {
  if (!isPending) return { open: false, reason: 'not pending after reload' };
  if (paymentInstructions === null) return { open: false, reason: 'instructions not loaded' };
  if (!paymentInstructions.trim()) return { open: false, reason: 'instructions empty' };
  return { open: true };
}

export function usePaySheet({
  isPending,
  paymentInstructions,
  language,
  sessionId,
}: {
  isPending: boolean;
  paymentInstructions: string | null;
  language: 'en' | 'es';
  sessionId: string;
}) {
  const [requested, setRequested] = useState(false);
  const [open, setOpen] = useState(false);

  // Runs on the render after onPaidRequestSent, which already carries the
  // reloaded isPending and paymentInstructions (they were set first).
  useEffect(() => {
    if (!requested) return;
    setRequested(false);
    const decision = paySheetDecision({ isPending, paymentInstructions });
    if (decision.open) {
      setOpen(true);
      return;
    }
    logError(new Error(`pay sheet not opened: ${decision.reason}`), { action: 'usePaySheet', sessionId });
    showSuccess(paidRequestSentMessage(language));
  }, [requested, isPending, paymentInstructions, language, sessionId]);

  return {
    open,
    close: () => setOpen(false),
    onPaidRequestSent: () => setRequested(true),
  };
}
