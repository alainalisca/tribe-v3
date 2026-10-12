'use client';

/**
 * T-PAY2 Step 5: bottom sheet shown once, right after a paid request is sent.
 * "Request sent, last step: pay your coach", the instructions, and "Pagar
 * ahora" (or "Entendido" when there is no link). Closing it leaves the pinned
 * PendingPayBar as the way back to the link.
 *
 * Built on the app's Radix Dialog parts, so focus moves in, Escape and a tap
 * on the dimmed page close it. data-modal / data-modal-close let the Android
 * back button close it through lib/backButton.ts.
 *
 * Visibility is the caller's job: only open it for a pending athlete who can
 * already see the instructions. Instructions render as text, never HTML.
 */

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, ExternalLink } from 'lucide-react';
import { Dialog, DialogPortal, DialogOverlay, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import PaymentInstructionsText from '@/components/session/PaymentInstructionsText';
import { firstPaymentLink } from '@/lib/text/linkifyPaymentText';
import { translateSport } from '@/lib/translations';
import { formatPriceForUser } from '@/lib/userCurrency';
import { useUserCurrency } from '@/lib/useUserCurrency';
import type { Currency } from '@/lib/payments/config';

interface PaymentSheetProps {
  open: boolean;
  onClose: () => void;
  sport: string;
  /** Session date, YYYY-MM-DD. */
  date: string;
  priceCents: number;
  currency: string | null;
  paymentInstructions: string;
  language: 'en' | 'es';
}

export default function PaymentSheet({
  open,
  onClose,
  sport,
  date,
  priceCents,
  currency,
  paymentInstructions,
  language,
}: PaymentSheetProps) {
  const { currency: userCurrency } = useUserCurrency();
  const es = language === 'es';
  const href = firstPaymentLink(paymentInstructions);
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString(es ? 'es-CO' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const primaryClass =
    'w-full min-h-[48px] rounded-xl bg-tribe-green text-slate-900 font-bold flex items-center justify-center gap-2 hover:opacity-90 transition';

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/60" />
        <DialogPrimitive.Content
          data-modal="true"
          className="fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-lg rounded-t-3xl bg-tribe-dark text-white px-6 pt-3 shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom duration-300"
          style={{ paddingBottom: 'calc(1.5rem + var(--safe-area-inset-bottom, 0px))' }}
        >
          <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-white/30" aria-hidden="true" />

          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-tribe-green">
            <Check className="h-7 w-7 text-slate-900" strokeWidth={3} />
          </div>
          <DialogTitle className="text-center text-xl font-bold text-white">
            {es ? '¡Solicitud enviada!' : 'Request sent!'}
          </DialogTitle>
          <DialogDescription className="mt-1 text-center text-sm text-white/70">
            {es
              ? 'Último paso: paga a tu coach para asegurar tu cupo.'
              : 'Last step: pay your coach to lock in your spot.'}
          </DialogDescription>

          <div className="mt-5 rounded-2xl bg-tribe-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-white">{translateSport(sport, language)}</p>
                <p className="text-sm capitalize text-white/70">{dateLabel}</p>
              </div>
              <p className="shrink-0 font-bold text-white">
                {formatPriceForUser(priceCents, (currency || 'USD') as Currency, userCurrency)}
              </p>
            </div>
            <div className="my-3 border-t border-white/10" />
            <PaymentInstructionsText
              text={paymentInstructions}
              className="text-sm text-white whitespace-pre-wrap break-words"
              linkClassName="underline font-medium break-all text-white"
            />
          </div>

          <div className="mt-5 space-y-2">
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className={primaryClass}>
                <ExternalLink className="h-5 w-5" />
                {es ? 'Pagar ahora' : 'Pay now'}
              </a>
            ) : (
              <button type="button" onClick={onClose} className={primaryClass}>
                {es ? 'Entendido' : 'Got it'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              data-modal-close="true"
              className="w-full py-2 text-sm font-semibold text-white/80 hover:text-white"
            >
              {es ? 'Pagaré después' : "I'll pay later"}
            </button>
          </div>

          <p className="mt-3 text-center text-xs text-white/50">
            {es
              ? 'Tribe no procesa, retiene ni reembolsa este pago. Tu coach confirma tu cupo cuando lo reciba.'
              : 'Tribe does not process, hold or refund this payment. Your coach confirms your spot once they receive it.'}
          </p>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
