'use client';

/**
 * /os/sessions/[id]/attendance — bulk attendance for one session.
 *
 * The single-client RecordAttendanceInline flow on /os/clients/[id]
 * is great for one-on-one training, but a group class with 10
 * attendees means 60+ clicks. This page collapses that into:
 *
 *   1. Load the full active roster + any existing attendance for
 *      this session in parallel.
 *   2. Render one row per client with a check-on-attended toggle
 *      and an optional payment amount.
 *   3. Submit fires parallel POSTs to the existing single-client
 *      attendance endpoint (which handles upserts, so re-submitting
 *      the same session is idempotent).
 *
 * We don't ship a bespoke batch endpoint here on purpose: each
 * single POST gets the same RLS / Zod validation as the inline
 * form, and parallel writes are well within typical gym sizes.
 * If a row fails, the others still go through and we mark just
 * the failed rows in the UI for the user to retry.
 *
 * Authorization: gated behind useTribeOSPremiumGate (any premium
 * user). The single-client POST endpoint then enforces "this
 * client is yours" via the parent client's RLS.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Save, AlertCircle, CheckCircle2, DollarSign } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { isValidUuid } from '@/lib/validations/uuid';
import { trackEvent } from '@/lib/analytics';
import { createClient } from '@/lib/supabase/client';
import type { ClientRow, AttendanceWithClient, PaymentMethod } from '@/lib/dal/clients';
import type { Currency } from '@/lib/payments/config';

interface SessionRow {
  id: string;
  title: string | null;
  sport: string | null;
  date: string;
  start_time: string | null;
  currency: Currency | null;
}

interface RowState {
  client_id: string;
  client_name: string;
  attended: boolean;
  paid: boolean;
  amount: string; // human-readable, converted to cents on submit
  currency: Currency;
  method: PaymentMethod;
  /** When set, this row already has a saved attendance record. */
  existing: boolean;
  /** True only when the user has modified the row since load. */
  dirty: boolean;
  /** Set after a save attempt — 'ok' or an error message. */
  saveStatus: 'idle' | 'saving' | 'ok' | 'error';
  errorMessage?: string;
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not_found' }
  | { kind: 'ready'; session: SessionRow; rows: RowState[] };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    backToDashboard: 'Back to dashboard',
    title: 'Record group attendance',
    loading: 'Loading',
    redirectingLabel: 'Redirecting',
    notFoundTitle: 'Session not found',
    notFoundHint: 'This session may have been deleted, or the URL is malformed.',
    errorTitle: 'Could not load this session',
    retry: 'Retry',
    noClients: 'You have no active clients yet. Add some on the clients page.',
    attendedColumn: 'Attended',
    paidColumn: 'Paid',
    amountPlaceholder: 'Amount',
    save: 'Save attendance',
    saving: 'Saving',
    nothingToSave: 'No changes',
    savedSome: (n: number) => (n === 1 ? '1 row saved' : `${n} rows saved`),
    failedSome: (n: number) => (n === 1 ? '1 row failed' : `${n} rows failed`),
    saveError: 'Could not save this row.',
  },
  es: {
    backToDashboard: 'Volver al panel',
    title: 'Registrar asistencia grupal',
    loading: 'Cargando',
    redirectingLabel: 'Redirigiendo',
    notFoundTitle: 'Sesión no encontrada',
    notFoundHint: 'Esta sesión pudo haber sido eliminada, o la URL es inválida.',
    errorTitle: 'No se pudo cargar la sesión',
    retry: 'Reintentar',
    noClients: 'Aún no tienes clientes activos. Agrégalos en la página de clientes.',
    attendedColumn: 'Asistió',
    paidColumn: 'Pagó',
    amountPlaceholder: 'Monto',
    save: 'Guardar asistencia',
    saving: 'Guardando',
    nothingToSave: 'Sin cambios',
    savedSome: (n: number) => (n === 1 ? '1 fila guardada' : `${n} filas guardadas`),
    failedSome: (n: number) => (n === 1 ? '1 fila falló' : `${n} filas fallaron`),
    saveError: 'No se pudo guardar esta fila.',
  },
} as const;

export default function BulkAttendancePage() {
  const { language } = useLanguage();
  const s = copy[language];
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;
  const gate = useTribeOSPremiumGate();

  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    if (!sessionId || !isValidUuid(sessionId)) {
      setState({ kind: 'not_found' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        // Sessions are world-readable, so a direct supabase query
        // is fine — the auth check is implicit (we already gated on
        // premium). RLS would let any signed-in user read this row.
        const supabase = createClient();
        const [sessionRes, clientsRes, attendanceRes] = await Promise.all([
          supabase.from('sessions').select('id, title, sport, date, start_time, currency').eq('id', sessionId).single(),
          fetch('/api/tribe-os/clients/?status=active', { method: 'GET' }),
          fetch(`/api/tribe-os/sessions/${sessionId}/attendance/`, { method: 'GET' }),
        ]);

        if (cancelled) return;

        if (sessionRes.error || !sessionRes.data) {
          setState({ kind: 'not_found' });
          return;
        }

        const clientsBody = (await clientsRes.json().catch(() => ({}))) as {
          success?: boolean;
          data?: ClientRow[];
        };
        const attendanceBody = (await attendanceRes.json().catch(() => ({}))) as {
          success?: boolean;
          data?: AttendanceWithClient[];
        };

        if (!clientsRes.ok || !clientsBody.success) {
          setState({ kind: 'error', message: s.errorTitle });
          return;
        }

        const existingByClient = new Map<string, AttendanceWithClient>();
        for (const a of attendanceBody.data ?? []) {
          existingByClient.set(a.client_id, a);
        }

        const session = sessionRes.data as SessionRow;
        const defaultCurrency: Currency = session.currency ?? 'USD';

        const rows: RowState[] = (clientsBody.data ?? []).map((c) => {
          const prior = existingByClient.get(c.id);
          return {
            client_id: c.id,
            client_name: c.name,
            attended: prior?.attended ?? false,
            paid: prior?.paid ?? false,
            amount: prior?.amount_paid_cents != null ? (prior.amount_paid_cents / 100).toString() : '',
            currency: (prior?.currency as Currency | null) ?? defaultCurrency,
            method: (prior?.payment_method as PaymentMethod | null) ?? 'cash',
            existing: prior != null,
            dirty: false,
            saveStatus: 'idle',
          };
        });

        setState({ kind: 'ready', session, rows });
        trackEvent('tribe_os_bulk_attendance_viewed', { roster_size: rows.length });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: s.errorTitle });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gate.state, sessionId, reloadKey, s.errorTitle]);

  function updateRow(clientId: string, patch: Partial<RowState>) {
    setState((prev) => {
      if (prev.kind !== 'ready') return prev;
      return {
        ...prev,
        rows: prev.rows.map((r) => (r.client_id === clientId ? { ...r, ...patch, dirty: true } : r)),
      };
    });
  }

  const dirtyCount = useMemo(() => (state.kind === 'ready' ? state.rows.filter((r) => r.dirty).length : 0), [state]);
  const saving = state.kind === 'ready' && state.rows.some((r) => r.saveStatus === 'saving');

  async function handleSave() {
    if (state.kind !== 'ready' || saving) return;
    const dirty = state.rows.filter((r) => r.dirty);
    if (dirty.length === 0) return;

    // Mark every dirty row as saving up front so the UI reflects
    // progress immediately, even before each promise settles.
    setState((prev) =>
      prev.kind === 'ready'
        ? {
            ...prev,
            rows: prev.rows.map((r) => (r.dirty ? { ...r, saveStatus: 'saving' as const } : r)),
          }
        : prev
    );

    await Promise.all(
      dirty.map(async (row) => {
        try {
          const cents = row.paid && row.amount ? Math.round(parseFloat(row.amount) * 100) : null;
          const body: Record<string, unknown> = {
            session_id: state.session.id,
            attended: row.attended,
            paid: row.paid && cents != null && cents > 0,
          };
          if (body.paid) {
            body.amount_paid_cents = cents;
            body.currency = row.currency;
            body.payment_method = row.method;
          }
          const res = await fetch(`/api/tribe-os/clients/${row.client_id}/attendance/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
          if (!res.ok || !json.success) {
            updateRowAfterSave(row.client_id, { saveStatus: 'error', errorMessage: json.error || s.saveError });
          } else {
            updateRowAfterSave(row.client_id, { saveStatus: 'ok', errorMessage: undefined });
          }
        } catch {
          updateRowAfterSave(row.client_id, { saveStatus: 'error', errorMessage: s.saveError });
        }
      })
    );

    trackEvent('tribe_os_bulk_attendance_saved', { dirty_count: dirty.length });
  }

  function updateRowAfterSave(clientId: string, patch: Partial<RowState>) {
    setState((prev) => {
      if (prev.kind !== 'ready') return prev;
      return {
        ...prev,
        rows: prev.rows.map((r) =>
          r.client_id === clientId ? { ...r, ...patch, dirty: patch.saveStatus === 'error' ? r.dirty : false } : r
        ),
      };
    });
  }

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-gray-600 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : s.loading}…
        </p>
      </main>
    );
  }

  return (
    <main className="text-gray-900 px-4 py-8 sm:py-10 pb-24">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/os/dashboard"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {s.backToDashboard}
        </Link>

        <header className="mb-5">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">{s.title}</h1>
          {state.kind === 'ready' ? (
            <p className="text-sm text-gray-600 mt-1">
              {state.session.title || state.session.sport || 'Session'} · {state.session.date}
              {state.session.start_time ? ` · ${state.session.start_time}` : ''}
            </p>
          ) : null}
        </header>

        {state.kind === 'loading' ? (
          <p className="py-12 text-center text-sm text-gray-500">{s.loading}…</p>
        ) : state.kind === 'not_found' ? (
          <div className="py-12 text-center space-y-2">
            <h2 className="text-lg font-bold">{s.notFoundTitle}</h2>
            <p className="text-sm text-gray-600 max-w-sm mx-auto leading-relaxed">{s.notFoundHint}</p>
          </div>
        ) : state.kind === 'error' ? (
          <div className="py-12 text-center space-y-4">
            <AlertCircle className="w-8 h-8 text-tribe-red mx-auto" />
            <p className="text-sm text-gray-700">{state.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-4 py-2 bg-white text-gray-900 text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            >
              {s.retry}
            </button>
          </div>
        ) : state.rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500 max-w-md mx-auto leading-relaxed">{s.noClients}</p>
        ) : (
          <>
            <ul className="space-y-2 mb-4">
              {state.rows.map((row) => (
                <AttendanceRow key={row.client_id} row={row} onChange={(p) => updateRow(row.client_id, p)} copy={s} />
              ))}
            </ul>

            <div className="sticky bottom-20 sm:bottom-6 bg-white backdrop-blur rounded-2xl border border-gray-200 p-3 flex items-center gap-3 mt-4">
              <p className="text-xs text-gray-500 flex-1">
                {dirtyCount === 0 ? s.nothingToSave : `${dirtyCount} ${dirtyCount === 1 ? 'change' : 'changes'}`}
              </p>
              <button
                type="button"
                onClick={handleSave}
                disabled={dirtyCount === 0 || saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-tribe-green text-tribe-dark text-sm font-bold rounded-full hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                {saving ? `${s.saving}…` : s.save}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function AttendanceRow({
  row,
  onChange,
  copy: s,
}: {
  row: RowState;
  onChange: (patch: Partial<RowState>) => void;
  copy: typeof copy.en | typeof copy.es;
}) {
  return (
    <li
      className={`p-3 rounded-xl border transition-colors ${
        row.saveStatus === 'ok'
          ? 'bg-tribe-green/5 border-tribe-green/30'
          : row.saveStatus === 'error'
            ? 'bg-tribe-red/5 border-red-200'
            : 'bg-white border-gray-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
          <input
            type="checkbox"
            checked={row.attended}
            onChange={(e) => onChange({ attended: e.target.checked })}
            className="w-5 h-5 accent-tribe-green shrink-0"
          />
          <span className="text-sm font-semibold text-gray-900 truncate">{row.client_name}</span>
        </label>
        {row.saveStatus === 'ok' ? <CheckCircle2 className="w-4 h-4 text-tribe-green shrink-0" /> : null}
        {row.saveStatus === 'error' ? <AlertCircle className="w-4 h-4 text-tribe-red shrink-0" /> : null}
      </div>

      {/* Payment row — collapsed by default to keep the roster
          compact. Showing the inputs only when 'attended' is on
          mirrors the natural workflow: you mark attended first,
          then decide whether/how much they paid. */}
      {row.attended ? (
        <div className="mt-2 ml-7 flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={row.paid}
              onChange={(e) => onChange({ paid: e.target.checked })}
              className="w-4 h-4 accent-tribe-green"
            />
            {s.paidColumn}
          </label>
          {row.paid ? (
            <>
              <div className="inline-flex items-center bg-white rounded-lg border border-gray-200 overflow-hidden">
                <span className="px-2 text-gray-500">
                  <DollarSign className="w-3 h-3" />
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={row.amount}
                  onChange={(e) => onChange({ amount: e.target.value })}
                  placeholder={s.amountPlaceholder}
                  className="w-20 bg-transparent text-sm text-gray-900 px-1 py-1 focus:outline-none"
                />
              </div>
              <select
                value={row.currency}
                onChange={(e) => onChange({ currency: e.target.value as Currency })}
                className="bg-white text-gray-900 text-xs rounded-lg border border-gray-200 px-2 py-1 focus:outline-none focus:border-tribe-green"
              >
                <option value="USD">USD</option>
                <option value="COP">COP</option>
              </select>
              <select
                value={row.method}
                onChange={(e) => onChange({ method: e.target.value as PaymentMethod })}
                className="bg-white text-gray-900 text-xs rounded-lg border border-gray-200 px-2 py-1 focus:outline-none focus:border-tribe-green"
              >
                <option value="cash">Cash</option>
                <option value="transfer">Transfer</option>
                <option value="stripe">Stripe</option>
                <option value="other">Other</option>
              </select>
            </>
          ) : null}
        </div>
      ) : null}

      {row.errorMessage ? <p className="mt-2 text-xs text-tribe-red ml-7">{row.errorMessage}</p> : null}
    </li>
  );
}
