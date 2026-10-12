'use client';

/**
 * T-PAY2 Step 5: bar pinned above the bottom nav while a paid request is
 * pending. Price and "Pendiente de pago" on the left; on the right "Pagar
 * ahora" when the instructions hold a link, otherwise "Cómo pagar", which
 * scrolls to the payment box. It never hides just because there is no link.
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
 * Bottom padding for the page while the bar shows: the page's usual pb-nav
 * clearance plus the bar (py-3 around a 48px button, about 4.5rem) and room to
 * spare, so the last card can always scroll fully into view.
 */
export const PENDING_PAY_BAR_CLEARANCE = 'calc(var(--bottom-nav-h) + 1.5rem + 5.5rem)';

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

interface PendingPayBarProps {
  priceCents: number;
  currency: string | null;
  paymentInstructions: string | null;
  language: 'en' | 'es';
}

export default function PendingPayBar({ priceCents, currency, paymentInstructions, language }: PendingPayBarProps) {
  const { currency: userCurrency } = useUserCurrency();
  const es = language === 'es';
  const href = paymentInstructions ? firstPaymentLink(paymentInstructions) : null;
  const buttonClass =
    'flex-1 min-h-[48px] rounded-xl bg-tribe-green text-slate-900 font-bold flex items-center justify-center gap-2 px-4 hover:opacity-90 transition';

  return (
    // Pinned to the bottom edge: the session detail page renders no BottomNav
    // (only its not-found branch does), so there is nothing to sit above, and
    // offsetting by --bottom-nav-h would float the bar over an empty gap. The
    // safe-area padding keeps it clear of the home indicator. The page adds
    // its own clearance (PENDING_PAY_BAR_CLEARANCE) so it never hides content.
    <div
      style={{ paddingBottom: 'var(--safe-area-inset-bottom, 0px)' }}
      className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-tribe-card border-t border-gray-200 dark:border-tribe-mid"
      role="region"
      aria-label={es ? 'Pago pendiente' : 'Payment pending'}
    >
      <div className="max-w-2xl md:max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
        <div className="min-w-0">
          <p className="font-bold text-stone-900 dark:text-white truncate">
            {formatPriceForUser(priceCents, (currency || 'USD') as Currency, userCurrency)}
          </p>
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            {es ? 'Pendiente de pago' : 'Payment pending'}
          </p>
        </div>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass}>
            <ExternalLink className="w-5 h-5" />
            {es ? 'Pagar ahora' : 'Pay now'}
          </a>
        ) : (
          <button
            type="button"
            onClick={() =>
              document.getElementById(PAYMENT_BOX_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
            className={buttonClass}
          >
            <Wallet className="w-5 h-5" />
            {es ? 'Cómo pagar' : 'How to pay'}
          </button>
        )}
      </div>
    </div>
  );
}
