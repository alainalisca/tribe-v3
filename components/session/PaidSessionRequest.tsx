'use client';

/**
 * PaidSessionRequest — T-PAY1 off-platform paid-session join.
 *
 * Tribe takes no money. For a paid session the athlete pays the instructor
 * directly (Nequi, bank transfer, cash, etc.) and the instructor confirms
 * receipt, which moves the athlete from pending to confirmed. This component
 * shows the price and, on "Request to join", a modal with the instructor's
 * payment instructions and a clear direct-payment disclaimer before creating
 * the pending request. There is NO checkout, charge, or money movement here.
 */

import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';

interface PaidSessionRequestProps {
  priceCents: number;
  currency: string;
  paymentInstructions: string | null;
  /**
   * Whether the viewer is allowed to see paymentInstructions at all (host or
   * participant-row holder). Distinct from `paymentInstructions === null`:
   * this modal opens BEFORE the request exists, so a first-time requester is
   * not yet a participant. Without this flag we would tell them the instructor
   * "hasn't added payment instructions", which is false when they simply
   * aren't visible yet.
   */
  canViewPaymentInstructions?: boolean;
  /** Creates the pending "awaiting payment" request (reuses the manual-approval join). */
  onRequest: () => void;
  requesting: boolean;
  language: 'en' | 'es';
}

export default function PaidSessionRequest({
  priceCents,
  currency,
  paymentInstructions,
  canViewPaymentInstructions = false,
  onRequest,
  requesting,
  language,
}: PaidSessionRequestProps) {
  const [open, setOpen] = useState(false);
  const es = language === 'es';
  // BUG-003: formatPrice already emits the ISO code (currencyDisplay: 'code'),
  // e.g. "COP 35.000". Prepending the currency again printed "COP COP 35.000".
  const priceLabel = formatPrice(priceCents, (currency || 'COP') as Currency);

  const copy = {
    paidSession: es ? 'Sesión de pago' : 'Paid session',
    directNote: es
      ? 'El pago se coordina directamente con el instructor'
      : 'Payment is arranged directly with the instructor',
    requestBtn: es ? 'Solicitar unirse' : 'Request to join',
    modalTitle: es ? 'Solicitar unirse a esta sesión' : 'Request to join this session',
    howToPay: es ? 'Cómo pagar al instructor' : 'How to pay the instructor',
    noInstructions: es
      ? 'El instructor aún no agregó instrucciones de pago. Coordina el pago directamente con el instructor.'
      : "The instructor hasn't added payment instructions yet. Arrange payment directly with the instructor.",
    instructionsAfterRequest: es
      ? 'Verás los datos de pago del instructor apenas envíes tu solicitud.'
      : "You'll see the instructor's payment details as soon as you send your request.",
    disclaimer: es
      ? 'El pago se coordina directamente entre tú y el instructor. Tribe no procesa, retiene ni reembolsa este pago.'
      : 'Payment is arranged directly between you and the instructor. Tribe does not process, hold, or refund it.',
    confirm: es ? 'Enviar solicitud' : 'Send request',
    cancel: es ? 'Cancelar' : 'Cancel',
    sending: es ? 'Enviando...' : 'Sending...',
  };

  return (
    <div className="space-y-2">
      <div className="w-full p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <p className="text-sm text-green-700 dark:text-green-300 font-medium">{copy.paidSession}</p>
        <p className="text-lg font-bold text-green-800 dark:text-green-200">{priceLabel}</p>
        <p className="text-xs text-green-700 dark:text-green-300 mt-1">{copy.directNote}</p>
      </div>

      <Button
        onClick={() => setOpen(true)}
        disabled={requesting}
        className="w-full py-3 font-bold bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
      >
        <CreditCard className="w-5 h-5" />
        {copy.requestBtn}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="bg-white dark:bg-tribe-surface rounded-lg p-6 max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-theme-primary">{copy.modalTitle}</DialogTitle>
            <DialogDescription className="sr-only">{copy.modalTitle}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2">
              <span className="text-sm font-medium text-green-700 dark:text-green-300">{copy.paidSession}</span>
              <span className="text-base font-bold text-green-800 dark:text-green-200">{priceLabel}</span>
            </div>

            <div>
              <p className="text-sm font-semibold text-theme-primary mb-1">{copy.howToPay}</p>
              {paymentInstructions && paymentInstructions.trim() ? (
                <p className="text-sm text-theme-secondary whitespace-pre-wrap rounded-lg bg-stone-100 dark:bg-tribe-mid px-3 py-2">
                  {paymentInstructions}
                </p>
              ) : canViewPaymentInstructions ? (
                // Visible to this viewer, and genuinely empty.
                <p className="text-sm text-theme-tertiary">{copy.noInstructions}</p>
              ) : (
                // Withheld, not absent — do not claim the instructor left it blank.
                <p className="text-sm text-theme-tertiary">{copy.instructionsAfterRequest}</p>
              )}
            </div>

            <p className="text-xs text-theme-tertiary rounded-lg border border-theme px-3 py-2">{copy.disclaimer}</p>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={requesting}
              className="flex-1 px-4 py-2 border border-stone-300 dark:border-tribe-mid rounded-lg text-theme-secondary hover:bg-stone-50 dark:hover:bg-tribe-mid disabled:opacity-50"
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={() => {
                onRequest();
                setOpen(false);
              }}
              disabled={requesting}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {requesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {copy.sending}
                </>
              ) : (
                copy.confirm
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
