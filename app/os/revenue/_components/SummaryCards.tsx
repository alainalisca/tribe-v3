'use client';

/**
 * Per-currency summary cards for the revenue dashboard.
 *
 * Renders one card per currency the instructor has activity in. Each
 * card shows gross, platform fee, refund (if any), net, and payment
 * count for the selected period. USD and COP cards sit side by side
 * when both have activity; otherwise just the one renders.
 */

import { useLanguage } from '@/lib/LanguageContext';
import type { CurrencyTotals, RevenueCurrency, RevenueSummary } from '@/lib/dal/revenue';

interface Props {
  totals: RevenueSummary['totals'];
  currencyDefault: RevenueCurrency;
}

function formatMoney(cents: number, currency: RevenueCurrency, locale: string): string {
  return new Intl.NumberFormat(locale === 'es' ? 'es-CO' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'COP' ? 0 : 2,
    maximumFractionDigits: currency === 'COP' ? 0 : 2,
  }).format(cents / 100);
}

export default function SummaryCards({ totals, currencyDefault }: Props): JSX.Element {
  const { language } = useLanguage();
  const s = COPY[language];

  // Order: lead with the instructor's default, then the other if present.
  const ordering: RevenueCurrency[] = ['USD', 'COP'];
  const ordered = [currencyDefault, ...ordering.filter((c) => c !== currencyDefault)].filter(
    (c) => totals[c] !== undefined
  );

  if (ordered.length === 0) {
    return <></>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {ordered.map((currency) => (
        <CurrencyCard key={currency} currency={currency} totals={totals[currency]!} copy={s} language={language} />
      ))}
    </div>
  );
}

type CopyShape = (typeof COPY)[keyof typeof COPY];

interface CurrencyCardProps {
  currency: RevenueCurrency;
  totals: CurrencyTotals;
  copy: CopyShape;
  language: 'en' | 'es';
}

/**
 * Threshold above which the refund rate gets a "watch this" warning
 * styling. 5% is the boundary between "occasional refund, normal
 * business" and "something's wrong" for a fitness operator —
 * derived from talking to gym owners, not pulled from a paper.
 * Tunable; lives here rather than at the type level because it's
 * a UI judgment call, not a contract.
 */
const REFUND_RATE_WARNING_PCT = 5;

function CurrencyCard({ currency, totals, copy, language }: CurrencyCardProps): JSX.Element {
  const hasRefunds = totals.refund_cents > 0;
  // Dollar-based refund rate. Falls back to 0 when gross is 0 (which
  // shouldn't happen alongside refunds > 0, but defensively avoids a
  // NaN if upstream ever flips). We round to nearest whole percent
  // because tenths of a percent here would be false precision.
  const refundRatePct = totals.gross_cents > 0 ? Math.round((totals.refund_cents / totals.gross_cents) * 100) : 0;
  const refundRateHigh = refundRatePct >= REFUND_RATE_WARNING_PCT;
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-xs uppercase tracking-[0.1em] font-semibold text-gray-500">{currency}</span>
        <span className="text-xs text-gray-500">
          {totals.payment_count === 1 ? copy.onePayment : copy.nPayments(totals.payment_count)}
        </span>
      </div>

      <div className="space-y-3">
        <Row label={copy.gross} value={formatMoney(totals.gross_cents, currency, language)} />
        <Row label={copy.fee} value={`-${formatMoney(totals.fee_cents, currency, language)}`} muted />
        {hasRefunds && (
          <>
            <Row label={copy.refunds} value={`-${formatMoney(totals.refund_cents, currency, language)}`} muted />
            {/* Refund rate — a quality canary. Surface it any time
                there's been at least one refund; warning styling
                kicks in past the threshold. Owners care because a
                sudden spike means something's actually wrong (class
                quality, billing confusion, instructor conflict)
                rather than the usual occasional cancellation. */}
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-gray-500">{copy.refundRate}</span>
              <span
                className={`text-xs font-semibold ${refundRateHigh ? 'text-tribe-red' : 'text-gray-500'}`}
                title={refundRateHigh ? copy.refundRateWarning : undefined}
              >
                {refundRatePct}%{refundRateHigh ? <span aria-hidden="true"> ⚠️</span> : null}
              </span>
            </div>
          </>
        )}
        <div className="pt-3 border-t border-gray-200">
          <Row label={copy.net} value={formatMoney(totals.net_cents, currency, language)} emphasis />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  emphasis,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasis?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`text-sm ${muted ? 'text-gray-500' : 'text-tribe-dark'}`}>{label}</span>
      <span
        className={
          emphasis
            ? 'text-2xl font-black text-tribe-dark'
            : muted
              ? 'text-sm text-gray-500'
              : 'text-base font-semibold text-tribe-dark'
        }
      >
        {value}
      </span>
    </div>
  );
}

const COPY = {
  en: {
    gross: 'Gross revenue',
    fee: 'Platform fees',
    refunds: 'Refunds',
    refundRate: 'Refund rate',
    refundRateWarning:
      'Refund rate is unusually high for this period. Worth checking whether a specific class, payment confusion, or member issue is driving it.',
    net: 'Net to you',
    onePayment: '1 payment',
    nPayments: (n: number) => `${n} payments`,
  },
  // ES PENDING VERONICA REVIEW
  es: {
    gross: 'Ingresos brutos',
    fee: 'Comisiones de plataforma',
    refunds: 'Reembolsos',
    refundRate: 'Tasa de reembolso',
    refundRateWarning:
      'La tasa de reembolso está más alta de lo normal en este período. Vale la pena revisar si una clase específica, confusión en cobros o algún miembro lo está causando.',
    net: 'Neto para ti',
    onePayment: '1 pago',
    nPayments: (n: number) => `${n} pagos`,
  },
} as const;
