'use client';

/**
 * Dashboard widget surfacing clients currently on a meaningful
 * active streak (7+ days). Mirror image of AtRiskClientsWidget:
 * that one prompts the coach to save a relationship; this one
 * prompts them to reinforce one.
 *
 * Hidden entirely when no members qualify so the dashboard doesn't
 * grow an empty card. Coaches running a brand-new gym aren't
 * losing anything — they just don't see the widget until someone
 * hits a Week-strong milestone.
 *
 * The per-row WhatsApp deep link uses the client's first name +
 * current streak day count in the templated congrats message.
 * Streak data is read-only here — coaches don't edit streaks
 * directly; the 079 attendance counter trigger owns that.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Flame, MessageCircle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { trackEvent } from '@/lib/analytics';
import { buildWhatsAppUrl } from '@/lib/phone';
import { Avatar, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/tribe-os/ui';
import type { ActiveStreaker } from '@/lib/dal/clients';

type WidgetState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; streakers: ActiveStreaker[] };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Celebrate these wins',
    subtitle: 'Members on an active streak. A two-line congrats from you goes a long way.',
    loading: 'Loading',
    error: 'Could not load this list.',
    viewAllCta: 'See all members',
    streakDays: (n: number) => (n === 1 ? '1-day streak' : `${n}-day streak`),
    longestEver: (n: number) => `Longest ever: ${n}`,
    whatsappAria: 'Send congrats on WhatsApp',
    whatsappCongratsMessage: (firstName: string, streak: number) =>
      `Hey ${firstName}! Just saw you're on a ${streak}-day streak — that's not easy. Proud of you. Keep it going 🔥`,
    waCta: 'Send congrats',
  },
  es: {
    title: 'Celebra estos triunfos',
    subtitle: 'Miembros con una racha activa. Un mensaje corto tuyo hace mucha diferencia.',
    loading: 'Cargando',
    error: 'No se pudo cargar esta lista.',
    viewAllCta: 'Ver todos los miembros',
    streakDays: (n: number) => (n === 1 ? 'racha de 1 día' : `racha de ${n} días`),
    longestEver: (n: number) => `Mejor racha: ${n}`,
    whatsappAria: 'Enviar felicitaciones por WhatsApp',
    whatsappCongratsMessage: (firstName: string, streak: number) =>
      `¡Hola ${firstName}! Acabo de ver que llevas ${streak} días seguidos entrenando, eso no es fácil. Orgulloso de ti. Sigue así 🔥`,
    waCta: 'Enviar felicitaciones',
  },
} as const;

export default function CelebrateWinsWidget() {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<WidgetState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const res = await fetch('/api/tribe-os/dashboard/milestones/', { method: 'GET' });
        if (cancelled) return;
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { streakers?: ActiveStreaker[] };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error' });
          return;
        }
        const streakers = body.data.streakers ?? [];
        setState({ kind: 'ready', streakers });
        if (streakers.length > 0) {
          trackEvent('tribe_os_celebrate_wins_viewed', { streaker_count: streakers.length });
        }
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Hide entirely when there's nothing to celebrate. Unlike the
  // at-risk widget (where "no one is at risk" is a meaningful
  // affirmation), an empty celebrate-wins state would just be a
  // dashboard card saying "no streakers" — better to disappear and
  // re-appear when someone earns the spot.
  if (state.kind === 'ready' && state.streakers.length === 0) {
    return null;
  }
  if (state.kind === 'error') {
    // Quiet failure. Don't add a "Could not load" card to the
    // dashboard — the widget is non-critical. Logged at fetch site.
    return null;
  }

  const streakerCount = state.kind === 'ready' ? state.streakers.length : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className="h-5 w-5 text-tribe-green-dark" />
            {s.title}
          </CardTitle>
          {streakerCount != null && streakerCount > 0 ? (
            <span className="text-sm font-semibold bg-tribe-green/15 text-tribe-green-dark px-2 py-1 rounded-full">
              {streakerCount}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-tribe-dark-80 mt-1">{s.subtitle}</p>
      </CardHeader>
      <CardContent className="p-0">
        {state.kind === 'loading' ? (
          <div className="px-6 py-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-tribe-dark-40 rounded-tribe animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-tribe-dark-40">
            {state.streakers.map((s2) => (
              <StreakerRow key={s2.id} streaker={s2} copy={s} />
            ))}
          </div>
        )}

        <div className="px-6 py-4 border-t border-tribe-dark-40">
          <Link
            href="/os/members"
            className="flex items-center gap-2 text-sm font-semibold text-tribe-green hover:text-tribe-green-dark transition-colors"
          >
            {s.viewAllCta}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function StreakerRow({ streaker, copy: s }: { streaker: ActiveStreaker; copy: typeof copy.en | typeof copy.es }) {
  const firstName = streaker.name.split(' ')[0] || streaker.name;
  const waUrl = buildWhatsAppUrl(streaker.phone, {
    message: s.whatsappCongratsMessage(firstName, streaker.current_streak_days),
  });
  const userInitials = initialsFromName(streaker.name);

  // Show "longest ever" subtext only when the current streak isn't
  // already the new record — otherwise the line is redundant
  // ("30-day streak · Longest ever: 30").
  const showLongestEver = streaker.longest_streak_days > streaker.current_streak_days;

  return (
    <div className="px-6 py-4 hover:bg-tribe-dark-40 transition-colors flex items-center justify-between gap-3">
      <Link
        href={`/os/clients/${streaker.id}`}
        onClick={() =>
          trackEvent('tribe_os_celebrate_row_clicked', {
            streak_days: streaker.current_streak_days,
            has_phone: streaker.phone !== null,
          })
        }
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <Avatar initials={userInitials} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-tribe-dark truncate">{streaker.name}</p>
          <p className="text-xs text-tribe-dark-80 truncate">
            <span className="inline-flex items-center gap-1">
              <Flame className="w-3 h-3 text-tribe-green-dark" />
              {s.streakDays(streaker.current_streak_days)}
            </span>
            {showLongestEver ? <> · {s.longestEver(streaker.longest_streak_days)}</> : null}
          </p>
        </div>
      </Link>
      {waUrl ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.whatsappAria}
          onClick={() =>
            trackEvent('tribe_os_celebrate_whatsapp_clicked', {
              streak_days: streaker.current_streak_days,
            })
          }
          className="shrink-0"
        >
          <Button variant="ghost" size="sm" className="gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" />
            {s.waCta}
          </Button>
        </a>
      ) : null}
    </div>
  );
}
