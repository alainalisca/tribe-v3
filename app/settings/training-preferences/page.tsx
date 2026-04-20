'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import { updateSeekingPreferences } from '@/lib/dal/leadDiscovery';
import type { SeekingBudget, SeekingSchedule, SeekingPreferences } from '@/lib/dal/leadDiscovery';
import { sportTranslations } from '@/lib/translations';
import { showSuccess, showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

const BUDGET_OPTIONS: SeekingBudget[] = ['free_only', 'budget', 'moderate', 'premium', 'any'];
const SCHEDULE_OPTIONS: SeekingSchedule[] = ['mornings', 'afternoons', 'evenings', 'weekends', 'flexible'];

export default function TrainingPreferencesPage() {
  const { language } = useLanguage();
  const router = useRouter();
  const supabase = createClient();

  const [prefs, setPrefs] = useState<SeekingPreferences>({
    seeking_trainer: false,
    seeking_trainer_sports: [],
    seeking_trainer_budget: null,
    seeking_trainer_schedule: null,
    seeking_trainer_note: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/auth');
        return;
      }
      const { data } = await supabase
        .from('users')
        .select(
          'seeking_trainer, seeking_trainer_sports, seeking_trainer_budget, seeking_trainer_schedule, seeking_trainer_note'
        )
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setPrefs({
          seeking_trainer: !!(data as { seeking_trainer: boolean | null }).seeking_trainer,
          seeking_trainer_sports: (data as { seeking_trainer_sports: string[] | null }).seeking_trainer_sports || [],
          seeking_trainer_budget:
            (data as { seeking_trainer_budget: SeekingBudget | null }).seeking_trainer_budget ?? null,
          seeking_trainer_schedule:
            (data as { seeking_trainer_schedule: SeekingSchedule | null }).seeking_trainer_schedule ?? null,
          seeking_trainer_note: (data as { seeking_trainer_note: string | null }).seeking_trainer_note ?? null,
        });
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  const handleSave = async () => {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const res = await updateSeekingPreferences(supabase, user.id, prefs);
    if (res.success) {
      await haptic('success');
      showSuccess(language === 'es' ? 'Preferencias guardadas' : 'Preferences saved');
    } else {
      showError(res.error || (language === 'es' ? 'Error' : 'Error'));
    }
    setSaving(false);
  };

  const budgetLabel = (b: SeekingBudget): string => {
    if (language === 'es') {
      return {
        free_only: 'Solo gratis',
        budget: 'Económico',
        moderate: 'Moderado',
        premium: 'Premium',
        any: 'Cualquiera',
      }[b];
    }
    return {
      free_only: 'Free only',
      budget: 'Budget',
      moderate: 'Moderate',
      premium: 'Premium',
      any: 'Any',
    }[b];
  };

  const scheduleLabel = (s: SeekingSchedule): string => {
    if (language === 'es') {
      return {
        mornings: 'Mañanas',
        afternoons: 'Tardes',
        evenings: 'Noches',
        weekends: 'Fines de semana',
        flexible: 'Flexible',
      }[s];
    }
    return {
      mornings: 'Mornings',
      afternoons: 'Afternoons',
      evenings: 'Evenings',
      weekends: 'Weekends',
      flexible: 'Flexible',
    }[s];
  };

  const toggleSport = (sport: string) => {
    setPrefs((p) => {
      const has = p.seeking_trainer_sports.includes(sport);
      return {
        ...p,
        seeking_trainer_sports: has
          ? p.seeking_trainer_sports.filter((s) => s !== sport)
          : [...p.seeking_trainer_sports, sport],
      };
    });
  };

  const t = {
    title: language === 'es' ? '¿Buscando un Entrenador?' : 'Looking for a Trainer?',
    subtitle:
      language === 'es'
        ? 'Cuando esté activado, los instructores verificados pueden descubrir tu perfil y contactarte.'
        : 'When ON, verified instructors can discover your profile and reach out to you.',
    toggleOn: language === 'es' ? 'Activado' : 'On',
    toggleOff: language === 'es' ? 'Desactivado' : 'Off',
    sports: language === 'es' ? 'Deportes de interés' : 'Sports interested in',
    budget: language === 'es' ? 'Presupuesto' : 'Budget',
    schedule: language === 'es' ? 'Horario preferido' : 'Preferred schedule',
    goals: language === 'es' ? '¿Cuáles son tus objetivos?' : 'What are your goals?',
    privacy:
      language === 'es'
        ? 'Solo instructores verificados pueden ver tu perfil. Tu información de contacto nunca se comparte.'
        : 'Only verified instructors can see your profile. Your contact information is never shared.',
    save: language === 'es' ? 'Guardar Preferencias' : 'Save Preferences',
    loading: language === 'es' ? 'Cargando…' : 'Loading…',
  };

  return (
    <div className="min-h-screen pb-24 bg-white dark:bg-[#272D34] text-stone-900 dark:text-white">
      <div className="max-w-xl mx-auto px-4 pt-6 space-y-6">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-[#A3E635]" />
          <h1 className="text-2xl font-extrabold">{t.title}</h1>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-gray-400">{t.loading}</p>
        ) : (
          <>
            <div className="bg-[#3D4349] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{prefs.seeking_trainer ? t.toggleOn : t.toggleOff}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.seeking_trainer}
                  onClick={() => setPrefs((p) => ({ ...p, seeking_trainer: !p.seeking_trainer }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    prefs.seeking_trainer ? 'bg-[#84cc16]' : 'bg-[#272D34]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      prefs.seeking_trainer ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">{t.subtitle}</p>
            </div>

            <section>
              <h2 className="text-sm font-semibold mb-2">{t.sports}</h2>
              <div className="flex flex-wrap gap-2">
                {Object.keys(sportTranslations)
                  .filter((s) => s !== 'All')
                  .map((sport) => {
                    const selected = prefs.seeking_trainer_sports.includes(sport);
                    const label = language === 'es' ? sportTranslations[sport].es : sportTranslations[sport].en;
                    return (
                      <button
                        key={sport}
                        type="button"
                        onClick={() => toggleSport(sport)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                          selected ? 'bg-[#84cc16] text-slate-900' : 'bg-[#3D4349] text-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
              </div>
            </section>

            <section>
              <label htmlFor="pref-budget" className="text-sm font-semibold block mb-1">
                {t.budget}
              </label>
              <select
                id="pref-budget"
                value={prefs.seeking_trainer_budget || ''}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    seeking_trainer_budget: (e.target.value || null) as SeekingBudget | null,
                  }))
                }
                className="w-full px-3 py-2 rounded-lg bg-[#3D4349] text-white text-sm"
              >
                <option value="">—</option>
                {BUDGET_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {budgetLabel(b)}
                  </option>
                ))}
              </select>
            </section>

            <section>
              <label htmlFor="pref-schedule" className="text-sm font-semibold block mb-1">
                {t.schedule}
              </label>
              <select
                id="pref-schedule"
                value={prefs.seeking_trainer_schedule || ''}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    seeking_trainer_schedule: (e.target.value || null) as SeekingSchedule | null,
                  }))
                }
                className="w-full px-3 py-2 rounded-lg bg-[#3D4349] text-white text-sm"
              >
                <option value="">—</option>
                {SCHEDULE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {scheduleLabel(s)}
                  </option>
                ))}
              </select>
            </section>

            <section>
              <label htmlFor="pref-note" className="text-sm font-semibold block mb-1">
                {t.goals}
              </label>
              <textarea
                id="pref-note"
                rows={3}
                value={prefs.seeking_trainer_note || ''}
                onChange={(e) => setPrefs((p) => ({ ...p, seeking_trainer_note: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[#3D4349] text-white text-sm resize-none"
              />
            </section>

            <p className="text-xs text-gray-500">{t.privacy}</p>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-sm font-bold disabled:opacity-50"
            >
              {saving ? '…' : t.save}
            </button>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
