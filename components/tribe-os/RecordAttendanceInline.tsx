'use client';

/**
 * Inline "Record attendance" form for the client detail page.
 *
 * Why this exists: pre-this-component, the only way to log a client's
 * attendance was to navigate to a session's detail page and use the
 * SessionAttendanceSection there. That works when you're reviewing a
 * session that just happened ("who showed up to my 8am yoga class")
 * but fails the other direction ("I just added Jane to my roster
 * and want to backfill the three sessions she came to last week").
 *
 * This component closes that gap. Drop on a client detail page; the
 * user clicks "Record attendance", picks one of their recent sessions
 * from a dropdown, optionally records a payment, and submits.
 *
 * Session list: queried live via the Supabase session client so the
 * caller sees exactly the sessions they created (filtered by
 * sessions.creator_id = auth.uid()). Capped at 30 most-recent for
 * the dropdown — beyond that, the instructor should use the session
 * detail page's attendance UI which is built for batch entry.
 *
 * Payment fields: same all-or-nothing pattern as the DB CHECK
 * (`attendance_payment_consistency`). If the user toggles "paid",
 * we surface amount + currency + method; on submit we send all
 * four together OR all four null.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { ChevronUp, Plus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';

type Currency = 'USD' | 'COP';
type PaymentMethod = 'cash' | 'transfer' | 'stripe' | 'other';

interface SessionOption {
  id: string;
  title: string;
  sport: string;
  date: string; // YYYY-MM-DD
}

interface RecordAttendanceInlineProps {
  /** Client to record attendance for. */
  clientId: string;
  /** Called after a successful submission so the parent can refresh
   *  its attendance history. */
  onRecorded?: () => void;
}

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    openCta: 'Record attendance',
    closeCta: 'Cancel',
    sessionLabel: 'Session',
    sessionPlaceholder: 'Select a session',
    sessionLoading: 'Loading sessions',
    sessionEmpty: 'No sessions yet. Create one first.',
    attendedLabel: 'They attended',
    paidLabel: 'They paid for this session',
    amountLabel: 'Amount paid',
    currencyLabel: 'Currency',
    methodLabel: 'Payment method',
    methodCash: 'Cash',
    methodTransfer: 'Transfer',
    methodStripe: 'Stripe',
    methodOther: 'Other',
    notesLabel: 'Notes',
    notesPlaceholder: 'Optional',
    submit: 'Record',
    submitting: 'Recording',
    successTitle: 'Attendance recorded',
    successHint: 'See it in the history below.',
    errorTitle: 'Could not record attendance',
    sessionRequired: 'Select a session.',
    amountRequired: 'Enter a positive amount.',
    genericError: 'Something went wrong. Please try again.',
  },
  es: {
    openCta: 'Registrar asistencia',
    closeCta: 'Cancelar',
    sessionLabel: 'Sesión',
    sessionPlaceholder: 'Elige una sesión',
    sessionLoading: 'Cargando sesiones',
    sessionEmpty: 'Aún no tienes sesiones. Crea una primero.',
    attendedLabel: 'Asistió',
    paidLabel: 'Pagó por esta sesión',
    amountLabel: 'Monto pagado',
    currencyLabel: 'Moneda',
    methodLabel: 'Método de pago',
    methodCash: 'Efectivo',
    methodTransfer: 'Transferencia',
    methodStripe: 'Stripe',
    methodOther: 'Otro',
    notesLabel: 'Notas',
    notesPlaceholder: 'Opcional',
    submit: 'Registrar',
    submitting: 'Registrando',
    successTitle: 'Asistencia registrada',
    successHint: 'Aparece en el historial abajo.',
    errorTitle: 'No se pudo registrar la asistencia',
    sessionRequired: 'Elige una sesión.',
    amountRequired: 'Ingresa un monto positivo.',
    genericError: 'Algo salió mal. Por favor intenta de nuevo.',
  },
} as const;

export default function RecordAttendanceInline({ clientId, onRecorded }: RecordAttendanceInlineProps) {
  const { language } = useLanguage();
  const s = copy[language];

  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionOption[] | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [attended, setAttended] = useState(true);
  const [paid, setPaid] = useState(false);
  const [amountInput, setAmountInput] = useState<string>('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch the caller's recent sessions when the form first opens.
  // sessions are world-readable (the feed surfaces all of them), so
  // RLS does NOT filter by creator. We have to scope explicitly by
  // creator_id = auth.uid() — otherwise the dropdown would show any
  // 30 recent sessions on the platform, which would let an instructor
  // accidentally record attendance against someone else's session.
  // The attendance INSERT itself would still be blocked by the
  // attendance RLS (which scopes to the instructor's clients), but
  // surfacing the wrong sessions in the picker is poor UX even when
  // the DB layer would reject the submit.
  useEffect(() => {
    if (!open || sessions !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setSessions([]);
          return;
        }
        const { data, error: fetchErr } = await supabase
          .from('sessions')
          .select('id, title, sport, date')
          .eq('creator_id', user.id)
          .order('date', { ascending: false })
          .limit(30);
        if (cancelled) return;
        if (fetchErr || !data) {
          setSessions([]);
          return;
        }
        setSessions(
          data.map((s) => ({
            id: s.id as string,
            title: (s.title as string) ?? '',
            sport: (s.sport as string) ?? '',
            date: (s.date as string) ?? '',
          }))
        );
      } catch {
        if (!cancelled) setSessions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sessions]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSuccess(false);

    if (!sessionId) {
      setError(s.sessionRequired);
      return;
    }

    let amountCents: number | undefined;
    if (paid) {
      const parsed = Number(amountInput.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError(s.amountRequired);
        return;
      }
      amountCents = Math.round(parsed * 100);
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        session_id: sessionId,
        attended,
        paid,
        attended_at: attended ? new Date().toISOString() : null,
      };
      if (paid && amountCents != null) {
        body.amount_paid_cents = amountCents;
        body.currency = currency;
        body.payment_method = method;
      }
      if (notes.trim().length > 0) {
        body.notes = notes.trim();
      }

      const res = await fetch(`/api/tribe-os/clients/${clientId}/attendance/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        setError(json.error || s.genericError);
        setSubmitting(false);
        return;
      }

      // Reset the form fields but keep the panel open briefly so the
      // user sees the success affirmation. Caller's onRecorded should
      // refresh history.
      setSuccess(true);
      setSubmitting(false);
      setSessionId('');
      setAttended(true);
      setPaid(false);
      setAmountInput('');
      setNotes('');
      onRecorded?.();
    } catch {
      setError(s.genericError);
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-tribe-green text-tribe-dark text-xs font-bold rounded-full shadow-[0_4px_20px_rgba(132,204,22,0.3)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.45)] hover:-translate-y-0.5 transition-all"
      >
        <Plus className="w-3.5 h-3.5" />
        {s.openCta}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-tribe-surface rounded-xl border border-tribe-mid p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">{s.openCta}</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setSuccess(false);
          }}
          aria-label={s.closeCta}
          className="text-white/60 hover:text-white transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      {/* Session picker */}
      <label className="block">
        <span className="block text-xs font-semibold text-white/80 mb-1">{s.sessionLabel}</span>
        <select
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          disabled={submitting || sessions === null || sessions.length === 0}
          className="w-full px-3 py-2 bg-tribe-dark text-white text-sm rounded-lg border border-tribe-mid focus:border-tribe-green focus:outline-none disabled:opacity-60"
        >
          <option value="">
            {sessions === null ? `${s.sessionLoading}…` : sessions.length === 0 ? s.sessionEmpty : s.sessionPlaceholder}
          </option>
          {sessions?.map((sess) => {
            const label = (sess.title?.length ? sess.title : sess.sport || '—') + (sess.date ? ` · ${sess.date}` : '');
            return (
              <option key={sess.id} value={sess.id}>
                {label}
              </option>
            );
          })}
        </select>
      </label>

      {/* Attended toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={attended}
          onChange={(e) => setAttended(e.target.checked)}
          className="w-4 h-4 accent-tribe-green"
        />
        <span className="text-sm text-white">{s.attendedLabel}</span>
      </label>

      {/* Paid toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={paid}
          onChange={(e) => setPaid(e.target.checked)}
          className="w-4 h-4 accent-tribe-green"
        />
        <span className="text-sm text-white">{s.paidLabel}</span>
      </label>

      {/* Payment fields revealed when paid is checked. Co-required
          per the DB CHECK constraint — submit assembles all three
          or omits all three. */}
      {paid ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider font-semibold text-white/60 mb-1">
              {s.amountLabel}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 bg-tribe-dark text-white text-sm rounded-lg border border-tribe-mid focus:border-tribe-green focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider font-semibold text-white/60 mb-1">
              {s.currencyLabel}
            </span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="w-full px-3 py-2 bg-tribe-dark text-white text-sm rounded-lg border border-tribe-mid focus:border-tribe-green focus:outline-none"
            >
              <option value="USD">USD</option>
              <option value="COP">COP</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider font-semibold text-white/60 mb-1">
              {s.methodLabel}
            </span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 bg-tribe-dark text-white text-sm rounded-lg border border-tribe-mid focus:border-tribe-green focus:outline-none"
            >
              <option value="cash">{s.methodCash}</option>
              <option value="transfer">{s.methodTransfer}</option>
              <option value="stripe">{s.methodStripe}</option>
              <option value="other">{s.methodOther}</option>
            </select>
          </label>
        </div>
      ) : null}

      {/* Notes */}
      <label className="block">
        <span className="block text-xs font-semibold text-white/80 mb-1">{s.notesLabel}</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={s.notesPlaceholder}
          maxLength={2000}
          className="w-full px-3 py-2 bg-tribe-dark text-white placeholder:text-white/40 text-sm rounded-lg border border-tribe-mid focus:border-tribe-green focus:outline-none"
        />
      </label>

      {error ? (
        <div
          className="flex items-start gap-2 p-2.5 bg-tribe-red/10 border border-tribe-red/30 rounded-lg text-xs text-white"
          role="alert"
        >
          <AlertCircle className="w-3.5 h-3.5 text-tribe-red shrink-0 mt-0.5" />
          <span>
            <span className="font-bold">{s.errorTitle}: </span>
            {error}
          </span>
        </div>
      ) : null}

      {success ? (
        <div
          className="flex items-start gap-2 p-2.5 bg-tribe-green/10 border border-tribe-green/40 rounded-lg text-xs text-white"
          role="status"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-tribe-green shrink-0 mt-0.5" />
          <span>
            <span className="font-bold">{s.successTitle}. </span>
            {s.successHint}
          </span>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          className="px-3 py-1.5 bg-tribe-dark text-white/70 text-xs font-semibold rounded-full border border-tribe-mid hover:text-white transition-colors disabled:opacity-60"
        >
          {s.closeCta}
        </button>
        <button
          type="submit"
          disabled={submitting || !sessionId}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-tribe-green text-tribe-dark text-xs font-bold rounded-full disabled:opacity-60 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5"
        >
          {submitting ? `${s.submitting}…` : s.submit}
        </button>
      </div>
    </form>
  );
}
