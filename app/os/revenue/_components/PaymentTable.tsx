'use client';

/**
 * Paginated payment table for the revenue dashboard.
 *
 * Fetches /api/tribe-os/revenue/payments for the current period and
 * renders one row per payment. Sortable by date and amount. "Load
 * more" pagination — appends additional pages rather than swapping
 * them out, so scrolling history is preserved.
 *
 * Refunded payments are visually muted with a "Refunded" badge so the
 * instructor can scan for them quickly. Dates render in the
 * instructor's local timezone.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import type { PaymentListResult, PaymentRow, PaymentSort } from '@/lib/dal/revenue';
import type { Period } from '../_lib/periods';

interface Props {
  period: Period;
  timezone: string;
}

const PAGE_SIZE = 50;

export default function PaymentTable({ period, timezone }: Props): JSX.Element {
  const { language } = useLanguage();
  const s = COPY[language];
  const locale = language === 'es' ? 'es-CO' : 'en-US';

  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [sort, setSort] = useState<PaymentSort>('date_desc');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const fetchPage = useCallback(
    async (append: boolean, pSort: PaymentSort, offset: number, currentPeriod: Period): Promise<void> => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const url =
          `/api/tribe-os/revenue/payments?from=${currentPeriod.from}&to=${currentPeriod.to}` +
          `&sort=${pSort}&limit=${PAGE_SIZE}&offset=${offset}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: PaymentListResult;
          error?: string;
        };
        if (!res.ok || !body.success || !body.data) {
          setError(body.error ? translateError(body.error, s) : s.errorGeneric);
          return;
        }
        if (append) {
          setRows((prev) => [...prev, ...body.data!.payments]);
        } else {
          setRows(body.data.payments);
        }
        setTotal(body.data.total);
        setHasMore(body.data.has_more);
      } catch {
        setError(s.errorNetwork);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [s]
  );

  // Refetch from offset 0 whenever the period or sort changes.
  useEffect(() => {
    fetchPage(false, sort, 0, period);
  }, [period, sort, fetchPage]);

  const toggleSort = (column: 'date' | 'amount') => {
    if (column === 'date') {
      setSort(sort === 'date_desc' ? 'date_asc' : 'date_desc');
    } else {
      setSort(sort === 'amount_desc' ? 'amount_asc' : 'amount_desc');
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-tribe-card border border-tribe-mid/20 p-8 text-center text-sm text-tribe-mid">
        <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin" />
        {s.loading}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-tribe-card border border-red-500/30 p-6 text-center">
        <p className="text-tribe-dark font-semibold mb-3 text-sm">{error}</p>
        <button
          type="button"
          onClick={() => fetchPage(false, sort, 0, period)}
          className="inline-flex items-center justify-center px-4 py-2 bg-tribe-green text-tribe-dark text-sm font-bold rounded-lg hover:-translate-y-0.5 transition-transform"
        >
          {s.retry}
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-tribe-card border border-tribe-mid/20 p-8 text-center text-sm text-tribe-mid">
        {s.empty}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-tribe-card border border-tribe-mid/20 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-tribe-mid/10">
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold text-tribe-mid uppercase tracking-wide text-xs">
                <SortableHeader
                  label={s.colDate}
                  active={sort.startsWith('date')}
                  ascending={sort === 'date_asc'}
                  onClick={() => toggleSort('date')}
                />
              </th>
              <th className="px-4 py-3 font-semibold text-tribe-mid uppercase tracking-wide text-xs">{s.colSession}</th>
              <th className="px-4 py-3 font-semibold text-tribe-mid uppercase tracking-wide text-xs">
                {s.colParticipant}
              </th>
              <th className="px-4 py-3 font-semibold text-tribe-mid uppercase tracking-wide text-xs text-right">
                <SortableHeader
                  label={s.colGross}
                  active={sort.startsWith('amount')}
                  ascending={sort === 'amount_asc'}
                  onClick={() => toggleSort('amount')}
                  align="right"
                />
              </th>
              <th className="px-4 py-3 font-semibold text-tribe-mid uppercase tracking-wide text-xs text-right">
                {s.colFee}
              </th>
              <th className="px-4 py-3 font-semibold text-tribe-mid uppercase tracking-wide text-xs text-right">
                {s.colRefund}
              </th>
              <th className="px-4 py-3 font-semibold text-tribe-mid uppercase tracking-wide text-xs text-right">
                {s.colNet}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <PaymentRowItem
                key={row.id}
                row={row}
                locale={locale}
                timezone={timezone}
                refundedLabel={s.refundedBadge}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-tribe-mid/20 bg-tribe-mid/5">
        <span className="text-xs text-tribe-mid">{s.showingCount(rows.length, total)}</span>
        {hasMore && (
          <button
            type="button"
            onClick={() => fetchPage(true, sort, rows.length, period)}
            disabled={loadingMore}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-tribe-dark bg-tribe-green/20 hover:bg-tribe-green/30 rounded-full transition-colors disabled:opacity-50"
          >
            {loadingMore ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
            {s.loadMore}
          </button>
        )}
      </div>
    </div>
  );
}

function PaymentRowItem({
  row,
  locale,
  timezone,
  refundedLabel,
}: {
  row: PaymentRow;
  locale: string;
  timezone: string;
  refundedLabel: string;
}): JSX.Element {
  const fmt = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: row.currency,
    minimumFractionDigits: row.currency === 'COP' ? 0 : 2,
    maximumFractionDigits: row.currency === 'COP' ? 0 : 2,
  });
  const dateFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const isRefunded = row.refunded_cents > 0;
  return (
    <tr
      className={
        isRefunded
          ? 'border-t border-tribe-mid/10 text-tribe-mid'
          : 'border-t border-tribe-mid/10 text-tribe-dark hover:bg-tribe-mid/5'
      }
    >
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          {dateFmt.format(new Date(row.created_at))}
          {isRefunded && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wide">
              {refundedLabel}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">{row.session_title}</td>
      <td className="px-4 py-3">{row.participant_name}</td>
      <td className="px-4 py-3 text-right tabular-nums">{fmt.format(row.gross_cents / 100)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-tribe-mid">{fmt.format(-row.fee_cents / 100)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-tribe-mid">
        {isRefunded ? fmt.format(-row.refunded_cents / 100) : '—'}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmt.format(row.net_cents / 100)}</td>
    </tr>
  );
}

function SortableHeader({
  label,
  active,
  ascending,
  onClick,
  align,
}: {
  label: string;
  active: boolean;
  ascending: boolean;
  onClick: () => void;
  align?: 'left' | 'right';
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        align === 'right'
          ? 'inline-flex items-center justify-end gap-1 w-full text-tribe-mid uppercase tracking-wide font-semibold text-xs hover:text-tribe-dark transition-colors'
          : 'inline-flex items-center gap-1 text-tribe-mid uppercase tracking-wide font-semibold text-xs hover:text-tribe-dark transition-colors'
      }
    >
      {label}
      {active && (ascending ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
    </button>
  );
}

function translateError(code: string, s: (typeof COPY)[keyof typeof COPY]): string {
  if (code === 'premium_required') return s.errorPremiumRequired;
  if (code === 'unauthorized') return s.errorUnauthorized;
  return s.errorGeneric;
}

const COPY = {
  en: {
    loading: 'Loading payments…',
    retry: 'Retry',
    empty: 'No payments in this period. Try a wider date range.',
    refundedBadge: 'Refunded',
    colDate: 'Date',
    colSession: 'Session',
    colParticipant: 'Participant',
    colGross: 'Gross',
    colFee: 'Fee',
    colRefund: 'Refund',
    colNet: 'Net',
    loadMore: 'Load more',
    showingCount: (shown: number, total: number) => `Showing ${shown} of ${total}`,
    errorGeneric: 'Something went wrong loading payments.',
    errorNetwork: 'Could not reach the server. Try again.',
    errorPremiumRequired: 'Tribe.OS premium is required to see payments.',
    errorUnauthorized: 'You need to sign in to see payments.',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    loading: 'Cargando pagos…',
    retry: 'Reintentar',
    empty: 'No hay pagos en este período. Prueba un rango más amplio.',
    refundedBadge: 'Reembolsado',
    colDate: 'Fecha',
    colSession: 'Sesión',
    colParticipant: 'Participante',
    colGross: 'Bruto',
    colFee: 'Comisión',
    colRefund: 'Reembolso',
    colNet: 'Neto',
    loadMore: 'Cargar más',
    showingCount: (shown: number, total: number) => `Mostrando ${shown} de ${total}`,
    errorGeneric: 'Algo salió mal al cargar los pagos.',
    errorNetwork: 'No se pudo conectar al servidor. Intenta de nuevo.',
    errorPremiumRequired: 'Se requiere Tribe.OS premium para ver los pagos.',
    errorUnauthorized: 'Necesitas iniciar sesión para ver los pagos.',
  },
} as const;
