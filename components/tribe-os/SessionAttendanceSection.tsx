'use client';

/**
 * Tribe.OS attendance section on the session detail page.
 *
 * Renders ONLY for the instructor (session.creator_id === viewer.id)
 * who is on Tribe.OS premium. Hidden silently for everyone else
 * (including the instructor when they're not on premium yet — we
 * don't push the upsell from here).
 *
 * Per session participant, two paths:
 *   - Participant's email matches one of the instructor's clients →
 *     render the attendance form mapped to that client.
 *   - No match → render an "Add as client" inline action that POSTs
 *     to /api/tribe-os/clients with the participant's name + email
 *     pre-filled, then re-renders as the form.
 *
 * Email matching is case-insensitive. Chosen over a linked_user_id
 * FK because it generalizes to clients who aren't Tribe users
 * (instructors track plenty of people who never sign up for the app).
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, AlertCircle, CheckCircle, DollarSign } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { showError, showSuccess } from '@/lib/toast';
import { formatCents } from '@/lib/format/currency';
import type { ClientRow, AttendanceRow, Currency, PaymentMethod } from '@/lib/dal/clients';
import { isTribeOSPremiumActive, type TribeOSPremiumFields } from '@/lib/dal/tribeOSPremium';

interface ParticipantRow {
  user_id: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

type PremiumRow = Pick<TribeOSPremiumFields, 'tribe_os_tier' | 'tribe_os_status'>;

interface Props {
  sessionId: string;
  /** From parent: viewer.id === session.creator_id. Section only renders when true. */
  isCreator: boolean;
}

const copy = {
  en: {
    sectionTitle: 'Tribe.OS client attendance',
    sectionHint: 'Mark which of your clients attended this session and track payments. Only you see this section.',
    loading: 'Loading',
    errorTitle: 'Could not load Tribe.OS attendance',
    retry: 'Retry',
    emptyParticipants: 'No participants yet to mark.',
    addAsClient: 'Add as client',
    adding: 'Adding',
    addError: 'Could not add this person as a client.',
    save: 'Save',
    saving: 'Saving',
    saveError: 'Could not save attendance.',
    attended: 'Attended',
    paid: 'Paid',
    amountLabel: 'Amount',
    currencyLabel: 'Currency',
    methodLabel: 'Method',
    method: { cash: 'Cash', transfer: 'Transfer', stripe: 'Stripe', other: 'Other' },
    saveSuccess: 'Attendance saved',
    addSuccess: 'Added to your client list',
    upgradeTitle: 'Track attendance with Tribe.OS',
    upgradeBody: 'Upgrade to Tribe.OS to mark client attendance and track payments per session.',
    upgradeCta: 'Learn more',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    sectionTitle: 'Asistencia de clientes Tribe.OS',
    sectionHint: 'Marca cuáles de tus clientes asistieron a esta sesión y registra pagos. Solo tú ves esta sección.',
    loading: 'Cargando',
    errorTitle: 'No se pudo cargar la asistencia de Tribe.OS',
    retry: 'Reintentar',
    emptyParticipants: 'Aún no hay participantes para marcar.',
    addAsClient: 'Agregar como cliente',
    adding: 'Agregando',
    addError: 'No se pudo agregar a esta persona como cliente.',
    save: 'Guardar',
    saving: 'Guardando',
    saveError: 'No se pudo guardar la asistencia.',
    attended: 'Asistió',
    paid: 'Pagado',
    amountLabel: 'Monto',
    currencyLabel: 'Moneda',
    methodLabel: 'Método',
    method: { cash: 'Efectivo', transfer: 'Transferencia', stripe: 'Stripe', other: 'Otro' },
    saveSuccess: 'Asistencia guardada',
    addSuccess: 'Agregado a tu lista de clientes',
    upgradeTitle: 'Registra asistencia con Tribe.OS',
    upgradeBody: 'Activa Tribe.OS para marcar la asistencia de tus clientes y registrar pagos por sesión.',
    upgradeCta: 'Más información',
  },
} as const;

type DataState =
  | { kind: 'loading' }
  | { kind: 'hidden' } // not authenticated — render nothing
  | { kind: 'upgrade' } // authenticated but not Tribe.OS premium — show upgrade CTA
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      participants: ParticipantRow[];
      clients: ClientRow[];
      attendanceByClient: Map<string, AttendanceRow>;
    };

export default function SessionAttendanceSection({ sessionId, isCreator }: Props) {
  const { language } = useLanguage();
  const s = copy[language];

  const [state, setState] = useState<DataState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isCreator) {
      setState({ kind: 'hidden' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const supabase = createBrowserSupabase();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setState({ kind: 'hidden' });
          return;
        }

        // Premium check (silent — no redirect from inside this section).
        const { data: premiumRow, error: premiumErr } = await supabase
          .from('users')
          .select('tribe_os_tier, tribe_os_status')
          .eq('id', user.id)
          .single();
        if (cancelled) return;
        if (premiumErr || !isTribeOSPremiumActive(premiumRow as PremiumRow)) {
          // BUG-009: non-premium creators used to see "Could not load
          // attendance" — misleading because it's a feature gate, not a
          // failure. Show a clear upgrade CTA instead.
          setState({ kind: 'upgrade' });
          return;
        }

        // Fetch participants joined to users (with email — needed for client matching).
        const { data: participantRows, error: pErr } = await supabase
          .from('session_participants')
          .select('user_id, user:users(id, name, email, avatar_url)')
          .eq('session_id', sessionId)
          .eq('status', 'confirmed');
        if (cancelled) return;
        if (pErr) {
          setState({ kind: 'error', message: s.errorTitle });
          return;
        }

        // Fetch instructor's full active client roster + this session's existing attendance.
        const [clientsRes, attendanceRes] = await Promise.all([
          fetch('/api/tribe-os/clients/', { method: 'GET' }),
          fetch(`/api/tribe-os/sessions/${sessionId}/attendance/`, { method: 'GET' }),
        ]);
        const clientsBody = (await clientsRes.json().catch(() => ({}))) as {
          success?: boolean;
          data?: ClientRow[];
        };
        const attendanceBody = (await attendanceRes.json().catch(() => ({}))) as {
          success?: boolean;
          data?: AttendanceRow[];
        };
        if (cancelled) return;
        if (!clientsRes.ok || !clientsBody.success) {
          setState({ kind: 'error', message: s.errorTitle });
          return;
        }

        const clients = (clientsBody.data ?? []) as ClientRow[];
        const attendanceList = (attendanceBody.data ?? []) as AttendanceRow[];
        const attendanceByClient = new Map<string, AttendanceRow>();
        for (const a of attendanceList) attendanceByClient.set(a.client_id, a);

        // The supabase nested-select returns user as either an object or
        // an array depending on PostgREST FK detection. Normalize to object.
        const participants = (
          (participantRows ?? []) as Array<{
            user_id: string;
            user:
              | { id: string; name: string | null; email: string | null; avatar_url: string | null }
              | { id: string; name: string | null; email: string | null; avatar_url: string | null }[]
              | null;
          }>
        ).map((p) => ({
          user_id: p.user_id,
          user: Array.isArray(p.user) ? (p.user[0] ?? null) : p.user,
        }));

        setState({ kind: 'ready', participants, clients, attendanceByClient });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: s.errorTitle });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, isCreator, reloadKey, s.errorTitle]);

  if (!isCreator || state.kind === 'hidden') return null;

  return (
    <section className="mt-6 bg-white dark:bg-tribe-card rounded-2xl border border-stone-200 dark:border-tribe-mid p-5">
      <h2 className="text-lg font-bold text-stone-900 dark:text-white">{s.sectionTitle}</h2>
      <p className="text-xs text-stone-500 dark:text-white/60 mt-1 leading-relaxed">{s.sectionHint}</p>

      <div className="mt-4">
        {state.kind === 'loading' ? (
          <p className="py-6 text-center text-sm text-stone-500 dark:text-white/60">{s.loading}…</p>
        ) : state.kind === 'upgrade' ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm font-semibold text-stone-900 dark:text-white">{s.upgradeTitle}</p>
            <p className="text-xs text-stone-500 dark:text-white/60 max-w-sm mx-auto leading-relaxed">
              {s.upgradeBody}
            </p>
            <a
              href="/os/dashboard/"
              className="inline-block px-4 py-2 rounded-lg bg-tribe-green text-slate-900 font-bold text-xs hover:bg-lime-500 transition"
            >
              {s.upgradeCta}
            </a>
          </div>
        ) : state.kind === 'error' ? (
          <div className="py-6 text-center space-y-3">
            <AlertCircle className="w-6 h-6 text-tribe-red mx-auto" />
            <p className="text-sm text-stone-700 dark:text-white/80">{state.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-3 py-1.5 bg-stone-200 dark:bg-tribe-surface text-stone-900 dark:text-white text-xs font-semibold rounded-lg hover:bg-stone-300 dark:hover:bg-tribe-mid transition-colors"
            >
              {s.retry}
            </button>
          </div>
        ) : state.participants.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500 dark:text-white/60">{s.emptyParticipants}</p>
        ) : (
          <ul className="space-y-3">
            {state.participants.map((p) => (
              <ParticipantAttendanceCard
                key={p.user_id}
                participant={p}
                sessionId={sessionId}
                clients={state.clients}
                existingAttendanceByClient={state.attendanceByClient}
                onChanged={() => setReloadKey((k) => k + 1)}
                copy={s}
                language={language}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ParticipantAttendanceCard({
  participant,
  sessionId,
  clients,
  existingAttendanceByClient,
  onChanged,
  copy: s,
  language,
}: {
  participant: ParticipantRow;
  sessionId: string;
  clients: ClientRow[];
  existingAttendanceByClient: Map<string, AttendanceRow>;
  onChanged: () => void;
  copy: typeof copy.en | typeof copy.es;
  language: 'en' | 'es';
}) {
  const matchedClient = useMemo(() => {
    const email = participant.user?.email?.trim().toLowerCase();
    if (!email) return null;
    return clients.find((c) => (c.email ?? '').trim().toLowerCase() === email) ?? null;
  }, [clients, participant.user?.email]);

  const existing = matchedClient ? existingAttendanceByClient.get(matchedClient.id) : undefined;

  const [adding, setAdding] = useState(false);
  const displayName = participant.user?.name ?? '—';
  const avatarUrl = participant.user?.avatar_url ?? null;

  async function handleAddAsClient() {
    if (!participant.user) return;
    setAdding(true);
    try {
      const res = await fetch('/api/tribe-os/clients/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: participant.user.name ?? 'Unnamed',
          email: participant.user.email ?? null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        showError(body.error || s.addError);
        setAdding(false);
        return;
      }
      showSuccess(s.addSuccess);
      onChanged();
    } catch {
      showError(s.addError);
      setAdding(false);
    }
  }

  return (
    <li className="bg-stone-50 dark:bg-tribe-surface rounded-xl border border-stone-200 dark:border-tribe-mid p-3">
      <div className="flex items-start gap-3">
        <Avatar className="w-10 h-10 shrink-0">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
          <AvatarFallback className="bg-stone-300 dark:bg-tribe-mid text-stone-700 dark:text-white text-sm font-bold">
            {(displayName.charAt(0) ?? '?').toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-900 dark:text-white truncate">{displayName}</p>
          {participant.user?.email ? (
            <p className="text-xs text-stone-500 dark:text-white/60 truncate">{participant.user.email}</p>
          ) : null}

          {matchedClient ? (
            <AttendanceForm
              sessionId={sessionId}
              client={matchedClient}
              existing={existing ?? null}
              onSaved={onChanged}
              copy={s}
              language={language}
            />
          ) : (
            <button
              type="button"
              onClick={handleAddAsClient}
              disabled={adding}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-tribe-green text-tribe-dark text-xs font-bold rounded-lg hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:transform-none"
            >
              <Plus className="w-3.5 h-3.5" />
              {adding ? `${s.adding}…` : s.addAsClient}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function AttendanceForm({
  sessionId,
  client,
  existing,
  onSaved,
  copy: s,
  language,
}: {
  sessionId: string;
  client: ClientRow;
  existing: AttendanceRow | null;
  onSaved: () => void;
  copy: typeof copy.en | typeof copy.es;
  language: 'en' | 'es';
}) {
  const [attended, setAttended] = useState<boolean>(existing?.attended ?? false);
  const [paid, setPaid] = useState<boolean>(existing?.paid ?? false);
  const [amount, setAmount] = useState<string>(
    existing?.amount_paid_cents != null ? String(existing.amount_paid_cents / 100) : ''
  );
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? 'USD');
  const [method, setMethod] = useState<PaymentMethod>(existing?.payment_method ?? 'cash');
  const [saving, setSaving] = useState(false);

  // Convert the visible amount to integer cents on save. Tolerates
  // user input with up to 2 decimals; rejects negatives.
  function amountToCents(): number | null {
    if (amount.trim().length === 0) return null;
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);

    const cents = amountToCents();
    const payload: Record<string, unknown> = {
      session_id: sessionId,
      attended,
      paid,
    };
    if (paid) {
      // paid=true requires positive amount; if the input is empty/invalid the API will reject.
      payload.amount_paid_cents = cents;
      payload.currency = currency;
      payload.payment_method = method;
    } else if (cents !== null && cents > 0) {
      // paid=false but they entered an amount — record it anyway (e.g. partial deposit).
      payload.amount_paid_cents = cents;
      payload.currency = currency;
      payload.payment_method = method;
    }

    try {
      const res = await fetch(`/api/tribe-os/clients/${client.id}/attendance/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        showError(body.error || s.saveError);
        setSaving(false);
        return;
      }
      showSuccess(s.saveSuccess);
      setSaving(false);
      onSaved();
    } catch {
      showError(s.saveError);
      setSaving(false);
    }
  }

  const displayAmount =
    existing?.amount_paid_cents != null && existing?.currency
      ? formatCents(existing.amount_paid_cents, existing.currency, language)
      : null;

  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2 sm:gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={attended}
            onChange={(e) => setAttended(e.target.checked)}
            className="accent-tribe-green w-4 h-4"
          />
          <CheckCircle className="w-3.5 h-3.5 text-stone-500 dark:text-white/60" />
          <span className="text-stone-700 dark:text-white/90">{s.attended}</span>
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={paid}
            onChange={(e) => setPaid(e.target.checked)}
            className="accent-tribe-green w-4 h-4"
          />
          <DollarSign className="w-3.5 h-3.5 text-stone-500 dark:text-white/60" />
          <span className="text-stone-700 dark:text-white/90">{s.paid}</span>
          {displayAmount ? <span className="text-tribe-green font-semibold ml-1">({displayAmount})</span> : null}
        </label>
      </div>

      {paid ? (
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={s.amountLabel}
            className="px-2 py-1.5 bg-white dark:bg-tribe-mid text-stone-900 dark:text-white text-xs rounded border border-stone-300 dark:border-tribe-card focus:border-tribe-green focus:outline-none"
            aria-label={s.amountLabel}
          />
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            className="px-2 py-1.5 bg-white dark:bg-tribe-mid text-stone-900 dark:text-white text-xs rounded border border-stone-300 dark:border-tribe-card focus:border-tribe-green focus:outline-none"
            aria-label={s.currencyLabel}
          >
            <option value="USD">USD</option>
            <option value="COP">COP</option>
          </select>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="px-2 py-1.5 bg-white dark:bg-tribe-mid text-stone-900 dark:text-white text-xs rounded border border-stone-300 dark:border-tribe-card focus:border-tribe-green focus:outline-none"
            aria-label={s.methodLabel}
          >
            <option value="cash">{s.method.cash}</option>
            <option value="transfer">{s.method.transfer}</option>
            <option value="stripe">{s.method.stripe}</option>
            <option value="other">{s.method.other}</option>
          </select>
        </div>
      ) : null}

      <div className="sm:col-span-2 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-tribe-green text-tribe-dark text-xs font-bold rounded-lg hover:-translate-y-0.5 transition-transform disabled:opacity-60 disabled:transform-none"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? `${s.saving}…` : s.save}
        </button>
      </div>
    </div>
  );
}
