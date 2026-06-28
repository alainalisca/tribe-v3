'use client';

/**
 * /os/revenue/unpaid — "Money owed to you" surface.
 *
 * Lists every client with at least one attended-but-not-paid session
 * in the last N days (default 60), grouped by client. For each row
 * the coach gets a one-tap WhatsApp deep link with a pre-filled
 * bilingual payment-reminder message.
 *
 * Why this page exists: revenue is already tracked per-attendance,
 * but there's no surface that says "here are the people who owe you
 * money — go nudge them." The intelligence engine surfaces REVENUE
 * insights for chronically-unpaid members, but a coach doing weekly
 * cash-collection work needs a direct list.
 *
 * Scope notes:
 *   - No "amount owed" displayed — the schema doesn't store an
 *     expected price per session. The reminder message intentionally
 *     leaves the amount vague ("for your recent sessions") and lets
 *     the coach quote the exact figure in the WhatsApp thread.
 *   - No bulk send — sending the same message to 30 people at once
 *     is the kind of action that benefits from a per-row decision.
 *     If usage shows real demand we can add a multi-select + send-
 *     to-all flow later.
 *   - No coach-side "mark as paid" affordance — the existing
 *     attendance edit flow handles that.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, DollarSign, Phone, MessageCircle, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { formatCents, formatShortDate } from '@/lib/format/currency';
import { buildWhatsAppUrl } from '@/lib/phone';
import { trackEvent } from '@/lib/analytics';

interface UnpaidGroup {
  client_id: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  unpaid_count: number;
  oldest_unpaid_at: string;
  newest_unpaid_at: string;
}

type SuggestedAmounts = Partial<Record<'USD' | 'COP', number>>;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; groups: UnpaidGroup[]; suggestedAmounts: SuggestedAmounts };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    backLabel: 'Back to revenue',
    pageTitle: 'Money owed to you',
    pageSubtitle: 'Clients with attended but unpaid sessions, newest first.',
    loadingLabel: 'Loading',
    redirectingLabel: 'Redirecting',
    errorTitle: 'Could not load unpaid attendance.',
    errorRetry: 'Retry',
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    windowLabel: 'Look back',
    windowOptions: [
      { value: 30, label: 'Last 30 days' },
      { value: 60, label: 'Last 60 days' },
      { value: 90, label: 'Last 90 days' },
    ],
    summary: (clients: number, sessions: number) =>
      `${clients} ${clients === 1 ? 'client' : 'clients'} · ${sessions} unpaid ${sessions === 1 ? 'session' : 'sessions'}`,
    emptyTitle: "You're all caught up",
    emptyHint: 'No unpaid attended sessions in this window. Either everyone has paid or there is nothing to chase yet.',
    emptyCta: 'Back to revenue dashboard',
    sinceLabel: 'Since',
    lastUnpaidLabel: 'Last',
    unpaidSessions: (n: number) => (n === 1 ? '1 unpaid session' : `${n} unpaid sessions`),
    waCta: 'WhatsApp reminder',
    noPhone: 'No phone on file',
    detailCta: 'Open member',
    reminderTemplate: (name: string, count: number, since: string) =>
      `Hi ${name}, hope you're doing well! Just a friendly reminder ` +
      `about ${count} ${count === 1 ? 'training session' : 'training sessions'} ` +
      `since ${since} that we still need to settle up. ` +
      `Let me know how you'd like to handle it — thanks!`,
    /** Variant of reminderTemplate that quotes a specific amount when we have one to suggest. */
    reminderTemplateWithAmount: (name: string, count: number, since: string, amount: string) =>
      `Hi ${name}, hope you're doing well! Just a friendly reminder ` +
      `about ${count} ${count === 1 ? 'training session' : 'training sessions'} ` +
      `since ${since} — that comes to about ${amount}. ` +
      `Let me know how you'd like to handle it — thanks!`,
    suggestedPriceHint: (price: string, currency: string) => `Typical session: ${price} ${currency}`,
    suggestedPriceFooter: (entries: string) =>
      `Reminder amounts are estimated from your gym's recent paid sessions (${entries}). Edit before sending.`,
  },
  es: {
    backLabel: 'Volver a ingresos',
    pageTitle: 'Lo que te deben',
    pageSubtitle: 'Clientes con sesiones asistidas pero sin pagar, más recientes primero.',
    loadingLabel: 'Cargando',
    redirectingLabel: 'Redirigiendo',
    errorTitle: 'No se pudo cargar la asistencia sin pagar.',
    errorRetry: 'Reintentar',
    refresh: 'Actualizar',
    refreshing: 'Actualizando',
    windowLabel: 'Ver últimos',
    windowOptions: [
      { value: 30, label: '30 días' },
      { value: 60, label: '60 días' },
      { value: 90, label: '90 días' },
    ],
    summary: (clients: number, sessions: number) =>
      `${clients} ${clients === 1 ? 'cliente' : 'clientes'} · ${sessions} ${sessions === 1 ? 'sesión sin pagar' : 'sesiones sin pagar'}`,
    emptyTitle: 'Estás al día',
    emptyHint: 'No hay sesiones asistidas sin pagar en esta ventana. O todos pagaron o aún no hay nada que cobrar.',
    emptyCta: 'Volver al panel de ingresos',
    sinceLabel: 'Desde',
    lastUnpaidLabel: 'Última',
    unpaidSessions: (n: number) => (n === 1 ? '1 sesión sin pagar' : `${n} sesiones sin pagar`),
    waCta: 'Recordatorio por WhatsApp',
    noPhone: 'Sin teléfono registrado',
    detailCta: 'Abrir miembro',
    reminderTemplate: (name: string, count: number, since: string) =>
      `Hola ${name}, ¡espero que estés bien! Solo te recuerdo amablemente ` +
      `${count} ${count === 1 ? 'sesión de entrenamiento' : 'sesiones de entrenamiento'} ` +
      `desde el ${since} que aún tenemos pendientes de pagar. ` +
      `Avísame cómo prefieres arreglarlo. ¡Gracias!`,
    reminderTemplateWithAmount: (name: string, count: number, since: string, amount: string) =>
      `Hola ${name}, ¡espero que estés bien! Solo te recuerdo amablemente ` +
      `${count} ${count === 1 ? 'sesión de entrenamiento' : 'sesiones de entrenamiento'} ` +
      `desde el ${since} — eso suma aproximadamente ${amount}. ` +
      `Avísame cómo prefieres arreglarlo. ¡Gracias!`,
    suggestedPriceHint: (price: string, currency: string) => `Sesión típica: ${price} ${currency}`,
    suggestedPriceFooter: (entries: string) =>
      `Los montos sugeridos se estiman a partir de las sesiones pagadas recientes de tu gym (${entries}). Edita antes de enviar.`,
  },
} as const;

export default function UnpaidAttendancePage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [windowDays, setWindowDays] = useState<number>(60);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    let cancelled = false;
    setRefreshing(true);

    (async () => {
      try {
        const res = await fetch(`/api/tribe-os/revenue/unpaid?window_days=${windowDays}`, { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { groups: UnpaidGroup[]; suggested_amount_cents?: SuggestedAmounts };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error', message: body.error || s.errorTitle });
          setRefreshing(false);
          return;
        }
        const suggestedAmounts = body.data.suggested_amount_cents ?? {};
        setState({ kind: 'ready', groups: body.data.groups, suggestedAmounts });
        setRefreshing(false);
        trackEvent('tribe_os_unpaid_attendance_viewed', {
          window_days: windowDays,
          group_count: body.data.groups.length,
          has_usd_suggestion: typeof suggestedAmounts.USD === 'number',
          has_cop_suggestion: typeof suggestedAmounts.COP === 'number',
        });
      } catch {
        if (!cancelled) {
          setState({ kind: 'error', message: s.errorTitle });
          setRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.state, windowDays, reloadKey, s.errorTitle]);

  const totals = useMemo(() => {
    if (state.kind !== 'ready') return { clients: 0, sessions: 0 };
    return {
      clients: state.groups.length,
      sessions: state.groups.reduce((n, g) => n + g.unpaid_count, 0),
    };
  }, [state]);

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-tribe-dark-80 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : s.loadingLabel}…
        </p>
      </main>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <Link href="/os/revenue" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-3.5 h-3.5" />
          {s.backLabel}
        </Link>

        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-tribe bg-tribe-green-50 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-tribe-green-dark" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-tribe-dark">{s.pageTitle}</h1>
              <p className="text-sm text-tribe-dark-80 mt-1">{s.pageSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-sm font-semibold text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? s.refreshing : s.refresh}
          </button>
        </header>

        <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-xl p-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span>{s.windowLabel}</span>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number.parseInt(e.target.value, 10))}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-tribe-green focus:ring-2 focus:ring-tribe-green/20"
            >
              {s.windowOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {state.kind === 'ready' && state.groups.length > 0 ? (
            <span className="text-xs text-gray-500 ml-auto">{s.summary(totals.clients, totals.sessions)}</span>
          ) : null}
        </div>

        {state.kind === 'loading' ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : state.kind === 'error' ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-tribe-red mx-auto" />
            <p className="text-sm text-gray-700">{state.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-4 py-2 bg-white text-gray-900 text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              {s.errorRetry}
            </button>
          </div>
        ) : state.groups.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-3">
            <DollarSign className="w-8 h-8 text-tribe-green-dark mx-auto" />
            <h2 className="text-base font-bold text-gray-900">{s.emptyTitle}</h2>
            <p className="text-sm text-gray-600 max-w-md mx-auto">{s.emptyHint}</p>
            {/* CTA back to the revenue dashboard. A coach landing on
                "nothing to collect" is in a good state — the natural
                next stop is the revenue dashboard to see actual
                inflows, not stay on a page about money they don't
                need to chase. */}
            <Link
              href="/os/revenue"
              className="inline-flex items-center gap-1.5 px-3 py-2 mt-2 bg-tribe-green text-tribe-dark text-sm font-semibold rounded-lg hover:bg-tribe-green-dark hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {s.emptyCta}
            </Link>
          </div>
        ) : (
          <>
            <SuggestedPriceHint suggestedAmounts={state.suggestedAmounts} copy={s} language={language} />
            <UnpaidList groups={state.groups} suggestedAmounts={state.suggestedAmounts} copy={s} language={language} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Pick which currency to quote in the WhatsApp reminder. Right now
 * we don't know which currency THIS client typically pays in, so we
 * fall back to a gym-wide preference: USD if we have a suggestion
 * there, otherwise COP. Coach edits before sending if it's wrong.
 *
 * Returns null when we have no suggested amount in either currency —
 * the caller then uses the no-amount template.
 */
function pickCurrencyForReminder(suggested: SuggestedAmounts): 'USD' | 'COP' | null {
  if (typeof suggested.USD === 'number') return 'USD';
  if (typeof suggested.COP === 'number') return 'COP';
  return null;
}

function SuggestedPriceHint({
  suggestedAmounts,
  copy: s,
  language,
}: {
  suggestedAmounts: SuggestedAmounts;
  copy: typeof copy.en | typeof copy.es;
  language: 'en' | 'es';
}) {
  // Build one chip per currency we have a suggestion for, plus a
  // single explanatory footer. Hidden entirely when no suggestions
  // are available (low-volume gym with < 3 paid sessions per currency).
  const chips: string[] = [];
  if (typeof suggestedAmounts.USD === 'number') {
    chips.push(s.suggestedPriceHint(formatCents(suggestedAmounts.USD, 'USD', language), 'USD'));
  }
  if (typeof suggestedAmounts.COP === 'number') {
    chips.push(s.suggestedPriceHint(formatCents(suggestedAmounts.COP, 'COP', language), 'COP'));
  }
  if (chips.length === 0) return null;

  return (
    <div className="bg-tribe-green/5 border border-tribe-green/30 rounded-xl px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        {chips.map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-tribe-green/40 text-xs font-semibold text-tribe-green-dark rounded-full"
          >
            <DollarSign className="w-3 h-3" />
            {label}
          </span>
        ))}
      </div>
      <p className="text-xs text-gray-600 mt-2 leading-relaxed">{s.suggestedPriceFooter(chips.join(' · '))}</p>
    </div>
  );
}

function UnpaidList({
  groups,
  suggestedAmounts,
  copy: s,
  language,
}: {
  groups: UnpaidGroup[];
  suggestedAmounts: SuggestedAmounts;
  copy: typeof copy.en | typeof copy.es;
  language: 'en' | 'es';
}) {
  const suggestedCurrency = pickCurrencyForReminder(suggestedAmounts);
  const suggestedUnitCents = suggestedCurrency ? suggestedAmounts[suggestedCurrency] : undefined;

  return (
    <ul className="space-y-2">
      {groups.map((g) => {
        const oldestDate = formatShortDate(g.oldest_unpaid_at, language);
        const newestDate = formatShortDate(g.newest_unpaid_at, language);
        // Build the WhatsApp message. When we have a suggested unit
        // price, multiply by the unpaid count to give the coach a
        // concrete number to quote ("that comes to about $60 USD").
        // Coach can edit before sending if the actual rate differs
        // for this member.
        let message: string;
        if (suggestedCurrency && suggestedUnitCents) {
          const totalCents = suggestedUnitCents * g.unpaid_count;
          const totalLabel = formatCents(totalCents, suggestedCurrency, language);
          message = s.reminderTemplateWithAmount(g.client_name, g.unpaid_count, oldestDate, totalLabel);
        } else {
          message = s.reminderTemplate(g.client_name, g.unpaid_count, oldestDate);
        }
        const waUrl = buildWhatsAppUrl(g.client_phone, { message });

        return (
          <li
            key={g.client_id}
            className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3 flex-wrap"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 truncate">{g.client_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {s.unpaidSessions(g.unpaid_count)} · {s.sinceLabel} {oldestDate}
                {oldestDate !== newestDate ? ` · ${s.lastUnpaidLabel} ${newestDate}` : ''}
              </p>
              {!g.client_phone ? (
                <p className="text-xs text-theme-tertiary mt-1 flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {s.noPhone}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    trackEvent('tribe_os_unpaid_whatsapp_clicked', {
                      client_id: g.client_id,
                      unpaid_count: g.unpaid_count,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-tribe-green text-tribe-dark text-xs font-semibold rounded-full hover:bg-tribe-green-dark hover:text-white transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  {s.waCta}
                </a>
              ) : null}
              <Link
                href={`/os/clients/${g.client_id}`}
                className="text-xs font-semibold text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline whitespace-nowrap"
              >
                {s.detailCta}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
