'use client';

/**
 * MyCoachEntryCard — entry-point card on /profile that links to
 * /my-coach for any user who's a client of at least one gym.
 *
 * Sister to TribeOSEntryCard:
 *   - TribeOSEntryCard is for COACHES — surfaces "open your dashboard"
 *     when they have a premium subscription
 *   - MyCoachEntryCard is for MEMBERS — surfaces "see your training
 *     as your gym tracks it" when their email matches at least one
 *     client row across any gym
 *
 * The two cards are intentionally separate so a user who's both a
 * coach AND a member of someone else's gym can see both entry points
 * — the role models are independent.
 *
 * Failure mode: silent hide. A 500 on the membership probe or zero
 * memberships → return null. The card is opt-out; we don't want a
 * blanket "Try My Coach!" pitch on every user's profile when they
 * have no connection to a gym yet.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

type State = 'loading' | 'hidden' | { kind: 'visible'; gymCount: number; primaryGymName: string };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: (gymCount: number, primaryGymName: string) =>
      gymCount === 1 ? `Your training at ${primaryGymName}` : `Your training across ${gymCount} gyms`,
    subtitle: 'See your streak, sessions, and training partners.',
    aria: 'Open My Coach',
  },
  es: {
    title: (gymCount: number, primaryGymName: string) =>
      gymCount === 1 ? `Tu entrenamiento en ${primaryGymName}` : `Tu entrenamiento en ${gymCount} gimnasios`,
    subtitle: 'Mira tu racha, sesiones y compañeros de entrenamiento.',
    aria: 'Abrir Mi Coach',
  },
} as const;

export default function MyCoachEntryCard() {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/training', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { memberships?: Array<{ gym_name: string }> };
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data?.memberships?.length) {
          setState('hidden');
          return;
        }
        const memberships = body.data.memberships;
        setState({
          kind: 'visible',
          gymCount: memberships.length,
          // First entry is already the most-recently-active gym
          // (see DAL sort). That's the right "primary" to highlight.
          primaryGymName: memberships[0].gym_name,
        });
      } catch {
        if (!cancelled) setState('hidden');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading state keeps a placeholder block so the profile-page
  // layout doesn't jump when the probe resolves. Matches the height
  // of the visible card.
  if (state === 'loading') {
    return <div className="mt-3 h-[76px] rounded-2xl bg-stone-100 dark:bg-tribe-mid/40 animate-pulse" />;
  }
  if (state === 'hidden') return null;

  return (
    <Link
      href="/my-coach"
      aria-label={s.aria}
      className="mt-3 flex items-center justify-between gap-3 w-full px-5 py-4 bg-white dark:bg-tribe-surface rounded-2xl border border-tribe-mid hover:border-tribe-green transition group"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-full bg-tribe-green/15 text-tribe-green-dark flex items-center justify-center shrink-0">
          <Briefcase className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-stone-900 dark:text-white truncate">
            {s.title(state.gymCount, state.primaryGymName)}
          </p>
          <p className="text-xs text-stone-500 dark:text-gray-400 truncate">{s.subtitle}</p>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-stone-400 group-hover:text-tribe-green shrink-0" />
    </Link>
  );
}
