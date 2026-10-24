'use client';

/**
 * T-PAY2 Step 5: what a pending athlete on a paid session sees in the session
 * page's bottom bar. Price and "Pendiente de pago" on top; under them "Pagar
 * ahora" when the instructions hold a link, otherwise "Cómo pagar", which
 * scrolls to the payment box, and "Cancelar solicitud" beside it. It never
 * hides just because there is no link.
 *
 * Ported onto T-UI-SD1's SessionActionBar (2026-10-23): the bar owns the
 * bottom slot, so the pay action lives inside its 'pending' state rather than
 * in a second fixed bar that would cover it and take "Cancelar solicitud" away.
 *
 * Tribe never touches the money: the link is the instructor's own, opened
 * outside the app the same way the inline links in PaymentInstructionsText are.
 */

import { ExternalLink, Wallet } from 'lucide-react';
import { firstPaymentLink } from '@/lib/text/linkifyPaymentText';
import { formatPriceForUser } from '@/lib/userCurrency';
import { useUserCurrency } from '@/lib/useUserCurrency';
import type { Currency } from '@/lib/payments/config';

/** Scroll target for "Cómo pagar": the green payment box in SessionDetails. */
export const PAYMENT_BOX_ID = 'session-payment-box';

/**
 * Bottom padding for the page while the pending-payment bar shows: the action
 * bar's own clearance (ACTION_BAR_CLEARANCE, 6.5rem) plus the price line above
 * the buttons, so the last card can always scroll fully into view.
 */
export const PENDING_PAY_BAR_CLEARANCE = 'calc(8.5rem + var(--safe-area-inset-bottom, 0px))';

/**
 * Pending athlete on a paid session only. Never the host, never a confirmed
 * athlete, never a logged-out visitor (canViewPaymentInstructions is false for
 * them), never a free session. canViewPaymentInstructions keeps the bar inside
 * the existing visibility rule.
 */
export function shouldShowPendingPayBar({
  canViewPaymentInstructions,
  isCreator,
  isPending,
  isPaidSession,
}: {
  canViewPaymentInstructions: boolean;
  isCreator: boolean;
  isPending: boolean;
  isPaidSession: boolean;
}): boolean {
  return canViewPaymentInstructions && !isCreator && isPending && isPaidSession;
}

interface PendingPayActionsProps {
  priceCents: number;
  currency: string | null;
  paymentInstructions: string | null;
  language: 'en' | 'es';
  /** "Cancelar solicitud": goes through the page's confirm dialog. */
  onWithdraw: () => void;
  withdrawLabel: string;
  /** The action bar's button styles, so this matches every other bar state. */
  primaryClassName: string;
  secondaryClassName: string;
}

export default function PendingPayActions({
  priceCents,
  currency,
  paymentInstructions,
  language,
  onWithdraw,
  withdrawLabel,
  primaryClassName,
  secondaryClassName,
}: PendingPayActionsProps) {
  const { currency: userCurrency } = useUserCurrency();
  const es = language === 'es';
  const href = paymentInstructions ? firstPaymentLink(paymentInstructions) : null;

  return (
    <div
      className="flex-1 min-w-0 flex flex-col gap-2"
      role="region"
      aria-label={es ? 'Pago pendiente' : 'Payment pending'}
    >
      <p className="flex items-baseline gap-2 text-sm">
        <span className="font-bold text-stone-900 dark:text-white truncate">
          {formatPriceForUser(priceCents, (currency || 'USD') as Currency, userCurrency)}
        </span>
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
          {es ? 'Pendiente de pago' : 'Payment pending'}
        </span>
      </p>
      <div className="flex items-stretch gap-2">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className={primaryClassName}>
            <ExternalLink className="w-5 h-5" />
            {es ? 'Pagar ahora' : 'Pay now'}
          </a>
        ) : (
          <button
            type="button"
            onClick={() =>
              document.getElementById(PAYMENT_BOX_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
            className={primaryClassName}
          >
            <Wallet className="w-5 h-5" />
            {es ? 'Cómo pagar' : 'How to pay'}
          </button>
        )}
        <button type="button" onClick={onWithdraw} className={secondaryClassName}>
          {withdrawLabel}
        </button>
      </div>
    </div>
  );
}
