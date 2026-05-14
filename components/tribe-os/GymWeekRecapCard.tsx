'use client';

/**
 * Coach-facing "this week vs last week" card. Sits between the
 * dashboard header and the KPI strip.
 *
 * Why a separate card from DashboardStats: DashboardStats is
 * monthly; this is weekly. Both views are useful, but they answer
 * different questions:
 *   - Monthly: "is the business growing month-over-month?"
 *   - Weekly: "are we ON PACE this week relative to last?"
 *
 * Hidden entirely when both windows are zero — a brand-new gym
 * doesn't see a card full of zeros on day one.
 *
 * Mirror of the member-side last-7-days card on /my-coach. Coaches
 * and members are looking at the same time scale from different
 * angles: members see THEIR attendance this week; coaches see
 * the GYM's attendance.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Users, Calendar } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface RecapData {
  attended_count_last_7d: number;
  attended_count_prev_7d: number;
  unique_members_last_7d: number;
  unique_members_prev_7d: number;
}

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: RecapData };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'This week at the gym',
    attendedLabel: 'Attendances',
    uniqueLabel: 'Unique members',
    deltaUp: (n: number) => `+${n} vs the week before`,
    deltaDown: (n: number) => `${n} less than the week before`,
    deltaSame: 'Same as the week before',
    firstWeek: 'Your first week tracked here.',
  },
  es: {
    title: 'Esta semana en el gym',
    attendedLabel: 'Asistencias',
    uniqueLabel: 'Miembros únicos',
    deltaUp: (n: number) => `+${n} vs. la semana anterior`,
    deltaDown: (n: number) => `${n} menos que la semana anterior`,
    deltaSame: 'Igual que la semana anterior',
    firstWeek: 'Tu primera semana registrada aquí.',
  },
} as const;

export default function GymWeekRecapCard() {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/tribe-os/dashboard/week-recap/', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: RecapData;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error' });
          return;
        }
        setState({ kind: 'ready', data: body.data });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Quiet failure modes — never block the dashboard for this card.
  if (state.kind === 'error') return null;
  if (state.kind === 'ready') {
    const { attended_count_last_7d, attended_count_prev_7d, unique_members_last_7d, unique_members_prev_7d } =
      state.data;
    // Hide entirely if both windows are zero. New gym, no signal.
    if (
      attended_count_last_7d === 0 &&
      attended_count_prev_7d === 0 &&
      unique_members_last_7d === 0 &&
      unique_members_prev_7d === 0
    ) {
      return null;
    }
  }

  if (state.kind === 'loading') {
    return <div className="bg-white border border-gray-200 rounded-2xl p-4 h-20 animate-pulse" aria-hidden="true" />;
  }

  const d = state.data;
  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5">
      <p className="text-xs uppercase tracking-[0.08em] text-gray-500 font-semibold mb-3">{s.title}</p>
      <div className="grid grid-cols-2 gap-4">
        <Slice
          icon={<Calendar className="w-4 h-4" />}
          label={s.attendedLabel}
          value={d.attended_count_last_7d}
          prev={d.attended_count_prev_7d}
          copy={s}
        />
        <Slice
          icon={<Users className="w-4 h-4" />}
          label={s.uniqueLabel}
          value={d.unique_members_last_7d}
          prev={d.unique_members_prev_7d}
          copy={s}
        />
      </div>
    </section>
  );
}

function Slice({
  icon,
  label,
  value,
  prev,
  copy: s,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  prev: number;
  copy: typeof copy.en | typeof copy.es;
}) {
  const delta = value - prev;
  let deltaIcon: React.ReactNode;
  let deltaText: string;
  let deltaClass: string;
  if (prev === 0 && value > 0) {
    deltaIcon = <TrendingUp className="w-3 h-3" />;
    deltaText = s.firstWeek;
    deltaClass = 'text-tribe-green-dark';
  } else if (delta > 0) {
    deltaIcon = <TrendingUp className="w-3 h-3" />;
    deltaText = s.deltaUp(delta);
    deltaClass = 'text-tribe-green-dark';
  } else if (delta < 0) {
    deltaIcon = <TrendingDown className="w-3 h-3" />;
    deltaText = s.deltaDown(delta);
    deltaClass = 'text-gray-600';
  } else {
    deltaIcon = <Minus className="w-3 h-3" />;
    deltaText = s.deltaSame;
    deltaClass = 'text-gray-600';
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-gray-500 mb-1">
        <span aria-hidden="true">{icon}</span>
        <p className="text-xs uppercase tracking-[0.08em] font-semibold">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className={`text-xs font-semibold mt-0.5 flex items-center gap-1 ${deltaClass}`}>
        {deltaIcon}
        <span className="truncate">{deltaText}</span>
      </p>
    </div>
  );
}
