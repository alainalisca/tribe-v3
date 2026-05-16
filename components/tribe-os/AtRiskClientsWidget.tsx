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
import { AlertCircle, ChevronRight, UserPlus, MessageCircle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { trackEvent } from '@/lib/analytics';
import { buildWhatsAppUrl } from '@/lib/phone';
import { Avatar, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/tribe-os/ui';
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
  /**
   * Scope to one team's members. When null, returns everyone in
   * the gym. Driven by the dashboard's team selector — both
   * at-risk and celebrate-wins share the same scope.
   */
  teamId?: string | null;
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

export default function AtRiskClientsWidget({
  thresholdDays = 14,
  limit = 5,
  teamId = null,
}: AtRiskClientsWidgetProps) {
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
        if (teamId) url.searchParams.set('team_id', teamId);

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
  }, [thresholdDays, limit, teamId]);

  const atRiskCount = state.kind === 'ready' ? state.clients.length : null;
  const hideViewAll = state.kind === 'ready' && state.totalClients === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="relative inline-block">
              <AlertCircle className="h-5 w-5 text-tribe-danger" />
              {atRiskCount != null && atRiskCount > 0 ? (
                <span className="absolute top-0 right-0 h-2 w-2 bg-tribe-danger rounded-full animate-pulse" />
              ) : null}
            </span>
            {s.title}
          </CardTitle>
          {atRiskCount != null && atRiskCount > 0 ? (
            <span className="text-sm font-semibold bg-red-100 text-tribe-danger px-2 py-1 rounded-full">
              {atRiskCount}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {state.kind === 'loading' ? (
          <div className="px-6 py-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-tribe-dark-40 rounded-tribe animate-pulse" />
            ))}
          </div>
        ) : state.kind === 'error' ? (
          <p className="text-sm text-tribe-dark-80 py-6 px-6 text-center">{s.error}</p>
        ) : state.clients.length === 0 && state.totalClients === 0 ? (
          <div className="py-6 px-6 text-center space-y-3">
            <p className="text-sm font-semibold text-tribe-dark">{s.zeroClientsTitle}</p>
            <p className="text-xs text-tribe-dark-80 max-w-xs mx-auto leading-relaxed">{s.zeroClientsHint}</p>
            <Link
              href="/os/clients/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-tribe-green text-tribe-dark text-xs font-semibold rounded-tribe hover:bg-tribe-green-dark transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {s.zeroClientsCta}
            </Link>
          </div>
        ) : state.clients.length === 0 ? (
          <div className="py-6 px-6 text-center space-y-1">
            <p className="text-sm font-semibold text-tribe-dark">{s.emptyTitle}</p>
            <p className="text-xs text-tribe-dark-80">{s.emptyHint}</p>
          </div>
        ) : (
          <div className="divide-y divide-tribe-dark-40">
            {state.clients.map((c) => (
              <AtRiskRow key={c.id} client={c} copy={s} />
            ))}
          </div>
        )}

        {!hideViewAll ? (
          <div className="px-6 py-4 border-t border-tribe-dark-40">
            <Link
              href="/os/clients"
              className="flex items-center gap-2 text-sm font-semibold text-tribe-green hover:text-tribe-green-dark transition-colors"
            >
              {s.viewAll}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
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
  const userInitials = initialsFromName(client.name);
  return (
    <div className="px-6 py-4 hover:bg-tribe-dark-40 transition-colors flex items-center justify-between gap-3">
      <Link
        href={`/os/clients/${client.id}`}
        onClick={() =>
          trackEvent('tribe_os_at_risk_clicked', {
            status: client.status,
            days_since_last_seen: client.days_since_last_seen,
            has_email: client.email !== null,
          })
        }
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <Avatar initials={userInitials} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-tribe-dark truncate">{client.name}</p>
          <p className="text-xs text-tribe-dark-80 truncate">{subtitle}</p>
        </div>
      </Link>
      {waUrl ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.whatsappAria}
          onClick={() => trackEvent('tribe_os_whatsapp_clicked', { surface: 'at_risk_widget' })}
          className="shrink-0"
        >
          <Button variant="ghost" size="sm" className="gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" />
            {s.reachOut}
          </Button>
        </a>
      ) : null}
    </div>
  );
}
