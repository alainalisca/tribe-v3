'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import {
  fetchSeekingAthletes,
  reachOutToAthlete,
  type SeekingAthlete,
  type SeekingBudget,
  type SeekingSchedule,
} from '@/lib/dal/leadDiscovery';
import { sportTranslations } from '@/lib/translations';
import { showSuccess, showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

const BUDGET_OPTIONS: Array<SeekingBudget | ''> = ['', 'free_only', 'budget', 'moderate', 'premium', 'any'];
const SCHEDULE_OPTIONS: Array<SeekingSchedule | ''> = [
  '',
  'mornings',
  'afternoons',
  'evenings',
  'weekends',
  'flexible',
];

function firstAndInitial(name: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}

export default function InstructorDiscoverPage() {
  const { language } = useLanguage();
  const router = useRouter();
  const supabase = createClient();

  const [athletes, setAthletes] = useState<SeekingAthlete[]>([]);
  const [credits, setCredits] = useState<number>(0);
  const [leadTier, setLeadTier] = useState<'free' | 'growth' | 'unlimited'>('free');
  const [sport, setSport] = useState<string>('');
  const [budget, setBudget] = useState<SeekingBudget | ''>('');
  const [schedule, setSchedule] = useState<SeekingSchedule | ''>('');
  const [loading, setLoading] = useState(true);
  const [busyFor, setBusyFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/auth');
      return;
    }
    // Gate: verified instructor only
    const { data: meRow } = await supabase
      .from('users')
      .select('is_instructor, is_verified_instructor, lead_credits_remaining, lead_tier, specialties')
      .eq('id', user.id)
      .single();
    const me = (meRow || null) as {
      is_instructor: boolean | null;
      is_verified_instructor: boolean | null;
      lead_credits_remaining: number | null;
      lead_tier: 'free' | 'growth' | 'unlimited' | null;
      specialties: string[] | null;
    } | null;
    if (!me?.is_instructor) {
      router.replace('/profile');
      return;
    }
    setCredits(me.lead_credits_remaining ?? 0);
    setLeadTier(me.lead_tier ?? 'free');

    const res = await fetchSeekingAthletes(supabase, {
      sport: sport || undefined,
      budget: budget || undefined,
      schedule: schedule || undefined,
      limit: 30,
    });
    if (res.success && res.data) setAthletes(res.data);
    setLoading(false);
  }, [supabase, router, sport, budget, schedule]);

  useEffect(() => {
    load();
  }, [load]);

  const t = {
    title: language === 'es' ? 'Descubrir Atletas' : 'Discover Athletes',
    subtitle: language === 'es' ? 'Atletas que están buscando un entrenador' : 'Athletes looking for a trainer',
    reachesLeft: (n: number) => (language === 'es' ? `${n} contactos este mes` : `${n} reaches this month`),
    unlimited: language === 'es' ? 'Ilimitados' : 'Unlimited',
    reach: language === 'es' ? 'Contactar (1 crédito)' : 'Reach Out (1 credit)',
    outOf: language === 'es' ? 'Sin créditos' : 'No credits',
    filters: language === 'es' ? 'Filtros' : 'Filters',
    sportFilter: language === 'es' ? 'Deporte' : 'Sport',
    budgetFilter: language === 'es' ? 'Presupuesto' : 'Budget',
    scheduleFilter: language === 'es' ? 'Horario' : 'Schedule',
    loading: language === 'es' ? 'Cargando…' : 'Loading…',
    empty: language === 'es' ? 'Ningún atleta coincide con estos filtros' : 'No athletes match these filters',
    reached: language === 'es' ? 'Contactado' : 'Reached',
    error: language === 'es' ? 'Error' : 'Error',
  };

  const budgetLabel = (b: SeekingBudget | ''): string => {
    if (!b) return '—';
    const map: Record<SeekingBudget, { en: string; es: string }> = {
      free_only: { en: 'Free only', es: 'Solo gratis' },
      budget: { en: 'Budget', es: 'Económico' },
      moderate: { en: 'Moderate', es: 'Moderado' },
      premium: { en: 'Premium', es: 'Premium' },
      any: { en: 'Any', es: 'Cualquiera' },
    };
    return language === 'es' ? map[b].es : map[b].en;
  };

  const scheduleLabel = (s: SeekingSchedule | ''): string => {
    if (!s) return '—';
    const map: Record<SeekingSchedule, { en: string; es: string }> = {
      mornings: { en: 'Mornings', es: 'Mañanas' },
      afternoons: { en: 'Afternoons', es: 'Tardes' },
      evenings: { en: 'Evenings', es: 'Noches' },
      weekends: { en: 'Weekends', es: 'Fines de semana' },
      flexible: { en: 'Flexible', es: 'Flexible' },
    };
    return language === 'es' ? map[s].es : map[s].en;
  };

  const handleReach = async (athleteId: string) => {
    setBusyFor(athleteId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusyFor(null);
      return;
    }
    const res = await reachOutToAthlete(supabase, user.id, athleteId);
    if (!res.success) {
      showError(res.error || t.error);
      setBusyFor(null);
      return;
    }
    await haptic('success');
    showSuccess(t.reached);
    setCredits(res.data!.creditsRemaining);
    // Hand off to messaging
    router.push(`/messages?to=${athleteId}`);
  };

  return (
    <div className="min-h-screen pb-24 bg-white dark:bg-[#272D34] text-stone-900 dark:text-white">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/instructor" className="p-2 rounded-lg hover:bg-[#3D4349]" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-extrabold flex items-center gap-2">
              <Search className="w-5 h-5 text-[#A3E635]" />
              {t.title}
            </h1>
            <p className="text-xs text-gray-400">{t.subtitle}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">{t.filters}</p>
            <p className="text-sm font-bold text-[#A3E635] flex items-center gap-1 justify-end">
              <Zap className="w-3.5 h-3.5" />
              {leadTier === 'unlimited' ? t.unlimited : t.reachesLeft(credits)}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[#3D4349] rounded-xl p-3 grid grid-cols-3 gap-2">
          <select
            aria-label={t.sportFilter}
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-[#272D34] text-white text-xs"
          >
            <option value="">{t.sportFilter}</option>
            {Object.keys(sportTranslations)
              .filter((s) => s !== 'All')
              .map((s) => (
                <option key={s} value={s}>
                  {language === 'es' ? sportTranslations[s].es : sportTranslations[s].en}
                </option>
              ))}
          </select>
          <select
            aria-label={t.budgetFilter}
            value={budget}
            onChange={(e) => setBudget(e.target.value as SeekingBudget | '')}
            className="px-2 py-1.5 rounded-lg bg-[#272D34] text-white text-xs"
          >
            {BUDGET_OPTIONS.map((b) => (
              <option key={b || 'any-filter'} value={b}>
                {b ? budgetLabel(b) : t.budgetFilter}
              </option>
            ))}
          </select>
          <select
            aria-label={t.scheduleFilter}
            value={schedule}
            onChange={(e) => setSchedule(e.target.value as SeekingSchedule | '')}
            className="px-2 py-1.5 rounded-lg bg-[#272D34] text-white text-xs"
          >
            {SCHEDULE_OPTIONS.map((s) => (
              <option key={s || 'any-schedule'} value={s}>
                {s ? scheduleLabel(s) : t.scheduleFilter}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-gray-400">{t.loading}</p>
        ) : athletes.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">{t.empty}</p>
        ) : (
          <ul className="space-y-3">
            {athletes.map((a) => {
              const sportLabels = (a.seeking_trainer_sports || [])
                .slice(0, 3)
                .map((s) => (language === 'es' ? sportTranslations[s]?.es || s : sportTranslations[s]?.en || s))
                .join(', ');
              const canReach = leadTier === 'unlimited' || credits > 0;
              return (
                <li key={a.id} className="bg-[#3D4349] rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#272D34] overflow-hidden relative flex-shrink-0">
                      {a.avatar_url ? (
                        <Image src={a.avatar_url} alt={a.name} fill sizes="40px" className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
                          {(a.name || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">
                        {firstAndInitial(a.name)}
                        {a.location ? (
                          <span className="text-xs text-gray-400 font-normal ml-2">{a.location}</span>
                        ) : null}
                      </p>
                      {sportLabels && <p className="text-xs text-gray-300">{sportLabels}</p>}
                      <p className="text-xs text-gray-400">
                        {budgetLabel(a.seeking_trainer_budget || '')}
                        {a.seeking_trainer_schedule ? ` · ${scheduleLabel(a.seeking_trainer_schedule)}` : ''}
                      </p>
                      {a.seeking_trainer_note && (
                        <p className="text-sm italic text-gray-200 mt-2">&ldquo;{a.seeking_trainer_note}&rdquo;</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReach(a.id)}
                    disabled={!canReach || busyFor === a.id}
                    className="mt-3 w-full py-2 rounded-lg bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-xs font-bold disabled:bg-[#272D34] disabled:text-gray-500"
                  >
                    {busyFor === a.id ? '…' : canReach ? t.reach : t.outOf}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
