'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';

/**
 * T-AV24. The way into /atletas/ from Profile and from Home.
 *
 * Al, 2026-09-30:
 *   Profile: shows whenever the athletes flag is on for this user, so a
 *            non-athlete can reach the not-in-program page.
 *   Home:    shows only when the flag is on AND the user has an active
 *            program_athletes row (/api/atletas/home-card answers a boolean).
 *
 * Renders nothing until the server says yes, and nothing on any error: the
 * default answer for an unreleased surface is no.
 */
interface AthletesEntryCardProps {
  where: 'profile' | 'home';
}

export default function AthletesEntryCard({ where }: AthletesEntryCardProps) {
  const t = useTranslations('athleteHome');
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = where === 'home' ? '/api/atletas/home-card/' : '/api/features/athlete-value/?feature=athletes';
    void (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { active?: unknown; enabled?: unknown };
        const yes = where === 'home' ? body.active === true : body.enabled === true;
        if (!cancelled) setShow(yes);
      } catch (error: unknown) {
        // Deliberately console rather than logError: this runs on every Home
        // and Profile load, and a failed flag check must stay invisible.
        console.error('[AthletesEntryCard] flag check failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [where]);

  if (!show) return null;
  return (
    <Link
      href="/atletas/"
      data-athletes-entry={where}
      className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-tribe-mid bg-white px-5 py-4 text-left dark:bg-tribe-surface"
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-tribe-green text-tribe-dark">
        <Trophy className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-bold text-theme-primary">{t('entryTitle')}</span>
        <span className="block text-sm text-theme-secondary">{t('entryBody')}</span>
      </span>
    </Link>
  );
}
