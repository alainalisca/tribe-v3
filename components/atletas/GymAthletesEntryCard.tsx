'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { createClient } from '@/lib/supabase/client';
import { hasAthleteProgram } from '@/lib/dal/athleteGym';

/**
 * T-AV26 (Al's decision 5). The gym owner's way into /atletas/gym/[id]/, on
 * /dashboard/partner. Shows only when the athletes flag is on for this user
 * AND the partner has a program (without one the dashboard is a 404).
 * Renders nothing until both say yes, and nothing on any error.
 */
interface GymAthletesEntryCardProps {
  partnerId: string;
}

export default function GymAthletesEntryCard({ partnerId }: GymAthletesEntryCardProps) {
  const t = useTranslations('gym');
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/features/athlete-value/?feature=athletes', { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { enabled?: unknown };
        if (body.enabled !== true) return;
        const hasProgram = await hasAthleteProgram(createClient(), partnerId);
        if (!cancelled) setShow(hasProgram);
      } catch (error: unknown) {
        // As AthletesEntryCard: a failed flag check must stay invisible.
        console.error('[GymAthletesEntryCard] flag check failed', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  if (!show) return null;
  return (
    <Link
      href={`/atletas/gym/${partnerId}/`}
      data-gym-athletes-entry
      className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-tribe-mid bg-white px-5 py-4 text-left dark:bg-tribe-surface"
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-tribe-green text-tribe-dark">
        <Trophy className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="text-base font-bold text-theme-primary">{t('title')}</span>
    </Link>
  );
}
