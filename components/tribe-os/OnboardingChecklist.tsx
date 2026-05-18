'use client';

/**
 * Onboarding checklist on /os/dashboard for new Tribe.OS subscribers.
 *
 * A small persistent card at the top of the dashboard that surfaces
 * the three concrete first-week actions a new instructor should take:
 *
 *   1. Add your first client       (clients page)
 *   2. Record your first attendance (client detail page)
 *   3. (Optional) Invite a coach    (coaches page)
 *
 * Unlike the one-time TribeOSWelcomeGuide modal — which a user might
 * skip and never see again — this card sits on the dashboard until
 * every required item is done (or the user explicitly dismisses it).
 *
 * State sources:
 *   - has_client / has_attendance / has_coach come from
 *     /api/tribe-os/dashboard/onboarding-state (a small head-only
 *     parallel-count endpoint).
 *   - dismissal is a single localStorage flag so it doesn't reappear
 *     after the user closes it.
 *
 * The card auto-hides in three cases:
 *   - All three items are complete (graduated).
 *   - User clicked the dismiss button.
 *   - The fetch failed (silent degrade — better than showing a
 *     broken-looking checklist).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle, X, ChevronRight, Sparkles } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { trackEvent } from '@/lib/analytics';

interface OnboardingState {
  has_client: boolean;
  has_attendance: boolean;
  has_coach: boolean;
}

type WidgetState = { kind: 'loading' } | { kind: 'hidden' } | { kind: 'visible'; data: OnboardingState };

const DISMISS_STORAGE_KEY = 'tribe_os_onboarding_dismissed_v1';

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Get set up',
    subtitle: 'A few quick steps to get the most out of Tribe.OS.',
    dismissAria: 'Dismiss onboarding checklist',
    addClient: 'Add your first client',
    addClientDone: 'First client added',
    addClientHint:
      'Build your roster so attendance and revenue start tracking. Add manually or import from a CSV — works the same either way.',
    addClientSecondaryLabel: 'Import CSV',
    addClientSecondaryHref: '/os/members',
    recordAttendance: 'Record your first attendance',
    recordAttendanceDone: 'First attendance recorded',
    recordAttendanceHint: 'Open any client and tap "Record attendance" to mark a session.',
    inviteCoach: 'Invite a coach (optional)',
    inviteCoachDone: 'Coach invited',
    inviteCoachHint: 'Share the gym with another instructor or assistant.',
    optional: 'Optional',
  },
  es: {
    title: 'Configura tu cuenta',
    subtitle: 'Algunos pasos rápidos para aprovechar al máximo Tribe.OS.',
    dismissAria: 'Cerrar la lista de configuración',
    addClient: 'Agrega tu primer cliente',
    addClientDone: 'Primer cliente agregado',
    addClientHint:
      'Construye tu lista para empezar a registrar asistencia e ingresos. Agrega manualmente o importa desde un CSV — ambos funcionan igual.',
    addClientSecondaryLabel: 'Importar CSV',
    addClientSecondaryHref: '/os/members',
    recordAttendance: 'Registra tu primera asistencia',
    recordAttendanceDone: 'Primera asistencia registrada',
    recordAttendanceHint: 'Abre cualquier cliente y toca "Registrar asistencia" para marcar una sesión.',
    inviteCoach: 'Invita a un entrenador (opcional)',
    inviteCoachDone: 'Entrenador invitado',
    inviteCoachHint: 'Comparte el gym con otro instructor o asistente.',
    optional: 'Opcional',
  },
} as const;

export default function OnboardingChecklist() {
  const { language } = useLanguage();
  const s = copy[language];

  const [state, setState] = useState<WidgetState>({ kind: 'loading' });

  useEffect(() => {
    // Honor a previous dismissal before issuing any network call.
    // localStorage is unavailable during SSR (we're 'use client'
    // but still guard for safety).
    if (typeof window !== 'undefined' && window.localStorage.getItem(DISMISS_STORAGE_KEY) === 'true') {
      setState({ kind: 'hidden' });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tribe-os/dashboard/onboarding-state/', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: OnboardingState;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          // Silent degrade — better than showing a busted checklist.
          setState({ kind: 'hidden' });
          return;
        }
        const data = body.data;
        // Graduate the user automatically once they've done the
        // three required items. (Coach is optional in copy but
        // counts as a graduation signal here so we don't dangle
        // a single checked-off card forever.)
        if (data.has_client && data.has_attendance && data.has_coach) {
          setState({ kind: 'hidden' });
          return;
        }
        setState({ kind: 'visible', data });
      } catch {
        if (!cancelled) setState({ kind: 'hidden' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind !== 'visible') return null;

  function handleDismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, 'true');
    }
    trackEvent('tribe_os_onboarding_dismissed');
    setState({ kind: 'hidden' });
  }

  return (
    <section className="relative bg-gradient-to-br from-tribe-green/10 to-white rounded-xl border border-tribe-green/30 p-5">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={s.dismissAria}
        className="absolute top-3 right-3 text-theme-tertiary hover:text-gray-700 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <header className="flex items-center gap-2 mb-1 pr-8">
        <Sparkles className="w-4 h-4 text-tribe-green shrink-0" />
        <h2 className="text-base font-bold text-gray-900">{s.title}</h2>
      </header>
      <p className="text-xs sm:text-sm text-gray-600 mb-4 leading-relaxed pr-8">{s.subtitle}</p>

      <ul className="space-y-2">
        <ChecklistItem
          done={state.data.has_client}
          title={state.data.has_client ? s.addClientDone : s.addClient}
          hint={s.addClientHint}
          href="/os/clients/new"
          eventName="onboarding_clients"
          // When the client step is still pending, surface a second
          // path: import from CSV. New coaches with an existing
          // spreadsheet roster don't have to retype it client by
          // client — they can land in the importer directly.
          secondaryHref={state.data.has_client ? undefined : s.addClientSecondaryHref}
          secondaryLabel={state.data.has_client ? undefined : s.addClientSecondaryLabel}
          secondaryEventName="onboarding_clients_csv"
        />
        <ChecklistItem
          done={state.data.has_attendance}
          title={state.data.has_attendance ? s.recordAttendanceDone : s.recordAttendance}
          hint={s.recordAttendanceHint}
          href="/os/clients"
          eventName="onboarding_attendance"
          // Until the user has at least one client, recording
          // attendance isn't actually possible — but linking to
          // /os/clients (where they can add one) keeps the flow
          // moving without us second-guessing the order.
        />
        <ChecklistItem
          done={state.data.has_coach}
          title={state.data.has_coach ? s.inviteCoachDone : s.inviteCoach}
          hint={s.inviteCoachHint}
          href="/os/coaches"
          eventName="onboarding_coach"
          badge={state.data.has_coach ? undefined : s.optional}
        />
      </ul>
    </section>
  );
}

function ChecklistItem({
  done,
  title,
  hint,
  href,
  eventName,
  badge,
  secondaryHref,
  secondaryLabel,
  secondaryEventName,
}: {
  done: boolean;
  title: string;
  hint: string;
  href: string;
  eventName: string;
  badge?: string;
  /** Optional secondary action shown as a small chip under the hint
   *  (e.g. "Import CSV" alongside "Add your first client"). Only
   *  shown when the item is NOT done — completed items don't need
   *  alternative paths. */
  secondaryHref?: string;
  secondaryLabel?: string;
  secondaryEventName?: string;
}) {
  // The primary row stays clickable (covers the whole card). The
  // secondary action sits inside the row but stops event propagation
  // so it doesn't trigger the primary navigation when clicked.
  return (
    <li>
      <Link
        href={href}
        onClick={() => trackEvent('tribe_os_onboarding_step_clicked', { step: eventName })}
        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
          done ? 'bg-tribe-green/5 border-tribe-green/20' : 'bg-white border-gray-200 hover:border-tribe-green/40'
        }`}
      >
        {done ? (
          <CheckCircle2 className="w-5 h-5 text-tribe-green shrink-0 mt-0.5" />
        ) : (
          <Circle className="w-5 h-5 text-theme-tertiary shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-semibold truncate ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
              {title}
            </p>
            {badge ? (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 font-bold">
                {badge}
              </span>
            ) : null}
          </div>
          <p className={`text-xs mt-0.5 leading-relaxed ${done ? 'text-gray-400' : 'text-gray-600'}`}>{hint}</p>
          {secondaryHref && secondaryLabel && !done ? (
            <Link
              href={secondaryHref}
              onClick={(e) => {
                // Stop propagation so the outer Link doesn't also
                // fire. The inner navigation handles this click.
                e.stopPropagation();
                if (secondaryEventName) {
                  trackEvent('tribe_os_onboarding_step_clicked', { step: secondaryEventName });
                }
              }}
              className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 bg-gray-100 hover:bg-tribe-green/10 text-gray-700 hover:text-tribe-green-dark text-xs font-semibold rounded-full transition-colors"
            >
              {secondaryLabel}
              <ChevronRight className="w-3 h-3" />
            </Link>
          ) : null}
        </div>
        {!done ? <ChevronRight className="w-4 h-4 text-theme-tertiary shrink-0 mt-1" /> : null}
      </Link>
    </li>
  );
}
