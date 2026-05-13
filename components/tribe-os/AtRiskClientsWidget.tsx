'use client';

/**
 * Dashboard widget surfacing at-risk clients.
 *
 * Fetches GET /api/tribe-os/clients/at-risk and renders up to N rows.
 * Three states the widget can be in:
 *   - loading   — skeleton placeholder
 *   - empty     — "no one to check in on" affirmation (the good state)
 *   - has rows  — vertical list, each a Link to /os/clients/[id]
 *
 * The widget mounts on /os/dashboard. It is intentionally narrow:
 * single column, list-style, no chart. The signal is "who haven't
 * I seen lately"; richer analytics (cohort retention, drop-off
 * funnel) is post-beta work.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, UserPlus, MessageCircle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { trackEvent } from '@/lib/analytics';
import { buildWhatsAppUrl } from '@/lib/phone';
import type { AtRiskClient } from '@/lib/dal/clients';

type WidgetState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; clients: AtRiskClient[]; totalClients: number | null };

interface AtRiskClientsWidgetProps {
  /** Days-since-last-seen threshold. Defaults to 14. */
  thresholdDays?: number;
  /** Max rows to show. Defaults to 5 (dashboard surface is narrow). */
  limit?: number;
}

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Members to check in on',
    subtitle: "Clients you haven't seen lately, or marked as lapsed.",
    loading: 'Loading',
    error: 'Could not load this list.',
    emptyTitle: 'Nobody to check in on',
    emptyHint: 'Every active client has been seen recently. Nice work.',
    zeroClientsTitle: 'Add your first client',
    zeroClientsHint: 'Once you have clients on your roster, this card will surface anyone who has not shown up lately.',
    zeroClientsCta: 'Add a client',
    viewAll: 'See all clients',
    daysAgo: (n: number) => (n === 1 ? '1 day ago' : `${n} days ago`),
    neverSeen: 'Never attended',
    statusLapsed: 'Lapsed',
    statusLead: 'Lead',
    whatsappAria: 'Message on WhatsApp',
    whatsappCheckInMessage: (name: string) => `Hey ${name}! Haven't seen you at training in a bit — everything ok?`,
    reachOut: 'Reach Out',
  },
  es: {
    title: 'Miembros para hacer seguimiento',
    subtitle: 'Clientes que no has visto últimamente o marcados como suspendidos.',
    loading: 'Cargando',
    error: 'No se pudo cargar esta lista.',
    emptyTitle: 'Nadie pendiente',
    emptyHint: 'Has visto a todos tus clientes activos recientemente. Buen trabajo.',
    zeroClientsTitle: 'Agrega tu primer cliente',
    zeroClientsHint:
      'Cuando tengas clientes en tu lista, esta tarjeta resaltará a quienes no se han aparecido últimamente.',
    zeroClientsCta: 'Agregar un cliente',
    viewAll: 'Ver todos los clientes',
    daysAgo: (n: number) => (n === 1 ? 'hace 1 día' : `hace ${n} días`),
    neverSeen: 'Nunca asistió',
    statusLapsed: 'Suspendido',
    statusLead: 'Prospecto',
    whatsappAria: 'Enviar mensaje por WhatsApp',
    whatsappCheckInMessage: (name: string) => `¡Hola ${name}! No te he visto entrenando hace rato. ¿Todo bien?`,
    reachOut: 'Contactar',
  },
} as const;

export default function AtRiskClientsWidget({ thresholdDays = 14, limit = 5 }: AtRiskClientsWidgetProps) {
  const { language } = useLanguage();
  const s = copy[language];

  const [state, setState] = useState<WidgetState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const url = new URL('/api/tribe-os/clients/at-risk/', window.location.origin);
        url.searchParams.set('thresholdDays', String(thresholdDays));
        url.searchParams.set('limit', String(limit));

        const res = await fetch(url.toString(), { method: 'GET' });
        if (cancelled) return;
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { at_risk?: AtRiskClient[]; total_clients?: number | null };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error' });
          return;
        }
        setState({
          kind: 'ready',
          clients: body.data.at_risk ?? [],
          totalClients: body.data.total_clients ?? null,
        });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [thresholdDays, limit]);

  const atRiskCount = state.kind === 'ready' ? state.clients.length : null;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 text-tribe-red shrink-0" />
          <h2 className="text-base font-bold text-gray-900 truncate">{s.title}</h2>
        </div>
        {atRiskCount != null && atRiskCount > 0 ? (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-tribe-red/10 text-tribe-red text-xs font-bold">
            {atRiskCount}
          </span>
        ) : null}
      </header>

      {state.kind === 'loading' ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : state.kind === 'error' ? (
        <p className="text-sm text-gray-500 py-4 text-center">{s.error}</p>
      ) : state.clients.length === 0 && state.totalClients === 0 ? (
        <div className="py-6 text-center space-y-3">
          <p className="text-sm font-semibold text-gray-900">{s.zeroClientsTitle}</p>
          <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">{s.zeroClientsHint}</p>
          <Link
            href="/os/clients/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-tribe-green text-tribe-dark text-xs font-bold rounded-full hover:-translate-y-0.5 transition-transform"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {s.zeroClientsCta}
          </Link>
        </div>
      ) : state.clients.length === 0 ? (
        <div className="py-6 text-center space-y-1">
          <p className="text-sm font-semibold text-gray-900">{s.emptyTitle}</p>
          <p className="text-xs text-gray-500">{s.emptyHint}</p>
        </div>
      ) : (
        <ul className="space-y-1 -mx-1">
          {state.clients.map((c) => (
            <AtRiskRow key={c.id} client={c} copy={s} />
          ))}
        </ul>
      )}

      {!(state.kind === 'ready' && state.totalClients === 0) ? (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <Link
            href="/os/clients"
            className="inline-flex items-center gap-1 text-xs font-semibold text-tribe-green hover:text-tribe-green/80 transition-colors"
          >
            {s.viewAll}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function AtRiskRow({ client, copy: s }: { client: AtRiskClient; copy: typeof copy.en | typeof copy.es }) {
  const subtitle =
    client.status === 'lapsed'
      ? s.statusLapsed
      : client.days_since_last_seen != null
        ? s.daysAgo(client.days_since_last_seen)
        : client.status === 'lead'
          ? s.statusLead
          : s.neverSeen;

  // WhatsApp deep-link with a pre-filled gentle check-in message
  // keyed off the client's first name. Only rendered when we have
  // a phone we can normalize — otherwise we silently skip the
  // button so the row doesn't appear to lose an action.
  const firstName = client.name.split(' ')[0] || client.name;
  const waUrl = buildWhatsAppUrl(client.phone, {
    message: s.whatsappCheckInMessage(firstName),
  });

  // Row uses a div instead of a wrapping Link so the WhatsApp
  // button can be its own clickable target (nested anchors are
  // invalid HTML and the inner click would otherwise bubble up
  // to the parent Link).
  const initial = (client.name.charAt(0) || '?').toUpperCase();
  return (
    <li>
      <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors group">
        <div className="w-8 h-8 rounded-full bg-tribe-green/20 text-tribe-dark font-bold flex items-center justify-center text-xs shrink-0">
          {initial}
        </div>
        <Link
          href={`/os/clients/${client.id}`}
          onClick={() =>
            trackEvent('tribe_os_at_risk_clicked', {
              status: client.status,
              days_since_last_seen: client.days_since_last_seen,
              has_email: client.email !== null,
            })
          }
          className="flex-1 min-w-0"
        >
          <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-tribe-dark">{client.name}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>
        </Link>
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.whatsappAria}
            onClick={() => trackEvent('tribe_os_whatsapp_clicked', { surface: 'at_risk_widget' })}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-tribe-dark hover:bg-tribe-green/15 rounded-full transition-colors shrink-0"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {s.reachOut}
          </a>
        ) : null}
      </div>
    </li>
  );
}
