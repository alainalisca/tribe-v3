/**
 * T-PAY2: "Pagar ahora" for an athlete whose paid-session request is pending.
 *
 * Opens the first http(s) link in the instructor's payment instructions,
 * outside the app, the same way the inline links in PaymentInstructionsText do.
 * Renders nothing when the instructions contain no valid link. Tribe never
 * touches the money: the athlete pays the instructor, who then confirms.
 */

import { ExternalLink } from 'lucide-react';
import { firstPaymentLink } from '@/lib/text/linkifyPaymentText';

/**
 * Pending athletes only. The host already knows their own link, and a
 * confirmed athlete has already paid (they still get the tappable inline link).
 * canViewPaymentInstructions keeps this inside the existing visibility rule.
 */
export function shouldShowPayNow({
  canViewPaymentInstructions,
  isCreator,
  isPending,
}: {
  canViewPaymentInstructions: boolean;
  isCreator: boolean;
  isPending: boolean;
}): boolean {
  return canViewPaymentInstructions && !isCreator && isPending;
}

interface PayNowButtonProps {
  paymentInstructions: string;
  language: 'en' | 'es';
}

export default function PayNowButton({ paymentInstructions, language }: PayNowButtonProps) {
  const href = firstPaymentLink(paymentInstructions);
  if (!href) return null;
  const es = language === 'es';

  return (
    <div className="mt-3 space-y-1.5">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full py-3 rounded-lg font-bold bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
      >
        <ExternalLink className="w-5 h-5" />
        {es ? 'Pagar ahora' : 'Pay now'}
      </a>
      <p className="text-xs text-emerald-700 dark:text-emerald-400 text-center">
        {es
          ? 'Pagas directamente al instructor. Después, el instructor confirma tu cupo.'
          : 'You pay the instructor directly. The instructor then confirms your spot.'}
      </p>
    </div>
  );
}
