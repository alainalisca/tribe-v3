/**
 * T-PAY2: renders payment instructions with any http(s) link tappable.
 *
 * Text is rendered as React text nodes, never as HTML. Links use a plain
 * target="_blank" anchor: on web it opens a new tab, and inside the Capacitor
 * shell iOS hands _blank to the system browser while Android opens any host
 * outside allowNavigation externally, so the athlete pays outside the app.
 *
 * Visibility is the caller's job: only render this where the instructions are
 * already allowed (host or participant).
 */

import { linkifyPaymentText } from '@/lib/text/linkifyPaymentText';

interface PaymentInstructionsTextProps {
  text: string;
  className?: string;
  linkClassName?: string;
}

export default function PaymentInstructionsText({
  text,
  className,
  linkClassName = 'underline font-medium break-all',
}: PaymentInstructionsTextProps) {
  return (
    <p className={className}>
      {linkifyPaymentText(text).map((segment, i) =>
        segment.type === 'link' ? (
          <a key={i} href={segment.href} target="_blank" rel="noopener noreferrer" className={linkClassName}>
            {segment.value}
          </a>
        ) : (
          <span key={i}>{segment.value}</span>
        )
      )}
    </p>
  );
}
