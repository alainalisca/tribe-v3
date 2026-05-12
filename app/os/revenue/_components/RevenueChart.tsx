'use client';

/**
 * Time-series bar chart for the revenue dashboard.
 *
 * Renders net revenue per bucket (week or month) for the selected
 * period. When the instructor has both USD and COP earnings we show
 * two separate small charts side by side rather than stacking — the
 * currencies aren't meaningfully comparable on a shared axis without
 * conversion (which we deliberately do not do).
 *
 * Recharts is the chart library. Single-color bars (tribe-green) with
 * an accent line for fees-vs-net would be nice in v2; for now we keep
 * the chart minimal and rely on the SummaryCards + tooltip for detail.
 *
 * If there are fewer than 2 buckets the chart renders an "insufficient
 * data" hint instead of an empty graph.
 */

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLanguage } from '@/lib/LanguageContext';
import type { CurrencyTotals, RevenueBucket, RevenueCurrency, RevenueGroupBy } from '@/lib/dal/revenue';

interface Props {
  buckets: RevenueBucket[];
  currencyDefault: RevenueCurrency;
  groupBy: RevenueGroupBy;
}

interface ChartPoint {
  bucketKey: string;
  label: string;
  net: number;
  gross: number;
  fee: number;
  refund: number;
  count: number;
}

const MONTH_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_SHORT_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function bucketLabel(bucket: RevenueBucket, groupBy: RevenueGroupBy, language: 'en' | 'es'): string {
  const [y, m, d] = bucket.period_start.split('-').map(Number);
  const months = language === 'es' ? MONTH_SHORT_ES : MONTH_SHORT_EN;
  if (groupBy === 'month') {
    return `${months[m - 1]} ${y}`;
  }
  // Week: e.g. "May 12-18" (or with year suffix if it spans Dec/Jan)
  const [ey, em, ed] = bucket.period_end.split('-').map(Number);
  if (m === em) {
    return `${months[m - 1]} ${d}-${ed}`;
  }
  if (y === ey) {
    return language === 'es'
      ? `${d} ${months[m - 1]} - ${ed} ${months[em - 1]}`
      : `${months[m - 1]} ${d} - ${months[em - 1]} ${ed}`;
  }
  return language === 'es'
    ? `${d} ${months[m - 1]} ${y} - ${ed} ${months[em - 1]} ${ey}`
    : `${months[m - 1]} ${d} ${y} - ${months[em - 1]} ${ed} ${ey}`;
}

function buildSeries(
  buckets: RevenueBucket[],
  currency: RevenueCurrency,
  groupBy: RevenueGroupBy,
  language: 'en' | 'es'
): ChartPoint[] {
  return buckets
    .filter((b) => b[currency])
    .map((b): ChartPoint => {
      const t = b[currency] as CurrencyTotals;
      return {
        bucketKey: b.period_start,
        label: bucketLabel(b, groupBy, language),
        net: t.net_cents / 100,
        gross: t.gross_cents / 100,
        fee: t.fee_cents / 100,
        refund: t.refund_cents / 100,
        count: t.payment_count,
      };
    });
}

function formatYAxis(value: number, currency: RevenueCurrency, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 10000 ? 'compact' : 'standard',
  }).format(value);
}

export default function RevenueChart({ buckets, currencyDefault, groupBy }: Props): JSX.Element {
  const { language } = useLanguage();
  const s = COPY[language];

  const usdSeries = useMemo(() => buildSeries(buckets, 'USD', groupBy, language), [buckets, groupBy, language]);
  const copSeries = useMemo(() => buildSeries(buckets, 'COP', groupBy, language), [buckets, groupBy, language]);

  const hasUsd = usdSeries.length >= 2;
  const hasCop = copSeries.length >= 2;

  if (!hasUsd && !hasCop) {
    return (
      <div className="rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.25)] p-8 text-center text-sm text-gray-600">
        {s.notEnoughData}
      </div>
    );
  }

  // If only one currency has enough data we render a single chart.
  // If both, render side-by-side.
  const singleSeries =
    hasUsd && !hasCop
      ? { currency: 'USD' as const, series: usdSeries }
      : !hasUsd && hasCop
        ? { currency: 'COP' as const, series: copSeries }
        : null;

  if (singleSeries) {
    return <ChartCard currency={singleSeries.currency} series={singleSeries.series} groupBy={groupBy} />;
  }

  // Both: place the default-lead currency first.
  const first = currencyDefault === 'COP' ? 'COP' : 'USD';
  const second = first === 'USD' ? 'COP' : 'USD';
  const firstSeries = first === 'USD' ? usdSeries : copSeries;
  const secondSeries = second === 'USD' ? usdSeries : copSeries;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard currency={first} series={firstSeries} groupBy={groupBy} />
      <ChartCard currency={second} series={secondSeries} groupBy={groupBy} />
    </div>
  );
}

function ChartCard({
  currency,
  series,
  groupBy,
}: {
  currency: RevenueCurrency;
  series: ChartPoint[];
  groupBy: RevenueGroupBy;
}): JSX.Element {
  const { language } = useLanguage();
  const locale = language === 'es' ? 'es-CO' : 'en-US';
  const s = COPY[language];

  return (
    <div className="rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.25)] p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-gray-500">
          {groupBy === 'week' ? s.titleWeekly : s.titleMonthly} ({currency})
        </h3>
      </div>
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgb(100,116,139)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'rgb(100,116,139)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => formatYAxis(value, currency, locale)}
              width={70}
            />
            <Tooltip
              cursor={{ fill: 'rgba(132, 204, 22, 0.08)' }}
              contentStyle={{
                background: '#FFFFFF',
                border: '1px solid rgba(100,116,139,0.2)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: 'rgb(39,45,52)', fontWeight: 600, marginBottom: 4 }}
              formatter={(value, name) => {
                const numeric = typeof value === 'number' ? value : Number(value ?? 0);
                const fmt = new Intl.NumberFormat(locale, {
                  style: 'currency',
                  currency,
                  minimumFractionDigits: currency === 'COP' ? 0 : 2,
                  maximumFractionDigits: currency === 'COP' ? 0 : 2,
                });
                return [fmt.format(numeric), tooltipLabel(String(name), s)];
              }}
            />
            <Bar dataKey="net" fill="#84cc16" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function tooltipLabel(name: string, s: (typeof COPY)[keyof typeof COPY]): string {
  if (name === 'net') return s.net;
  if (name === 'gross') return s.gross;
  if (name === 'fee') return s.fee;
  if (name === 'refund') return s.refund;
  return name;
}

const COPY = {
  en: {
    titleWeekly: 'Net revenue by week',
    titleMonthly: 'Net revenue by month',
    notEnoughData: 'Not enough data to graph yet — try a wider date range.',
    net: 'Net',
    gross: 'Gross',
    fee: 'Fee',
    refund: 'Refund',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    titleWeekly: 'Ingresos netos por semana',
    titleMonthly: 'Ingresos netos por mes',
    notEnoughData: 'Aún no hay suficientes datos para graficar. Prueba un rango más amplio.',
    net: 'Neto',
    gross: 'Bruto',
    fee: 'Comisión',
    refund: 'Reembolso',
  },
} as const;
