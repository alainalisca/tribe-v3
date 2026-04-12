/** Component: TrainingPreferencesForm — set sports, availability, gender pref, distance */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { SPORTS_LIST, SPORTS_TRANSLATIONS, type Sport } from '@/lib/sports';
import { upsertTrainingPreferences, fetchTrainingPreferences } from '@/lib/dal/smartMatch';
import type { AvailabilitySlot } from '@/lib/dal/smartMatch';
import { showSuccess, showError } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import MatchingInstructorResults from '@/components/MatchingInstructorResults';

const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DISTANCE_OPTIONS = [1, 5, 10, 15, 25, 50];
const TIME_OPTIONS = [
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
];

interface Props {
  userId: string;
}

export default function TrainingPreferencesForm({ userId }: Props) {
  const supabase = createClient();
  const { language } = useLanguage();
  const isEs = language === 'es';

  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [availability, setAvailability] = useState<Record<string, { enabled: boolean; start: string; end: string }>>(
    {}
  );
  const [genderPref, setGenderPref] = useState<'any' | 'male' | 'female'>('any');
  const [maxDistance, setMaxDistance] = useState(10);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const initial: Record<string, { enabled: boolean; start: string; end: string }> = {};
    DAY_KEYS.forEach((day) => {
      initial[day] = { enabled: false, start: '08:00', end: '12:00' };
    });
    setAvailability(initial);
    loadPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadPreferences() {
    const result = await fetchTrainingPreferences(supabase, userId);
    if (result.success && result.data) {
      setSelectedSports(result.data.preferred_sports || []);
      setGenderPref((result.data.gender_preference as 'any' | 'male' | 'female') || 'any');
      setMaxDistance(result.data.max_distance_km || 10);
      const slots = (result.data.availability as AvailabilitySlot[] | null) || [];
      const restored: Record<string, { enabled: boolean; start: string; end: string }> = {};
      DAY_KEYS.forEach((day) => {
        const slot = slots.find((s) => s.day === day);
        restored[day] = slot
          ? { enabled: true, start: slot.start, end: slot.end }
          : { enabled: false, start: '08:00', end: '12:00' };
      });
      setAvailability(restored);
      if (result.data.preferred_sports && result.data.preferred_sports.length > 0) {
        setSaved(true);
      }
    }
    setLoaded(true);
  }

  function toggleSport(sport: string) {
    setSelectedSports((prev) => (prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]));
  }

  function toggleDay(day: string) {
    setAvailability((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: !prev[day]?.enabled },
    }));
  }

  function updateDayTime(day: string, field: 'start' | 'end', value: string) {
    setAvailability((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const slots: AvailabilitySlot[] = [];
      DAY_KEYS.forEach((day) => {
        const slot = availability[day];
        if (slot?.enabled) {
          slots.push({ day, start: slot.start, end: slot.end });
        }
      });

      const result = await upsertTrainingPreferences(supabase, userId, {
        preferred_sports: selectedSports,
        availability: slots,
        gender_preference: genderPref,
        max_distance_km: maxDistance,
        active: true,
      });

      if (!result.success) throw new Error(result.error);
      showSuccess(isEs ? 'Preferencias guardadas' : 'Preferences saved');
      setSaved(true);
    } catch {
      showError(isEs ? 'Error al guardar preferencias' : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tribe-green" />
      </div>
    );
  }

  const days = isEs ? DAYS_ES : DAYS_EN;
  // Split days: Mon-Thu (indices 0-3) left column, Fri-Sun (indices 4-6) right column
  const leftDays = [0, 1, 2, 3];
  const rightDays = [4, 5, 6];

  function renderDayToggle(dayIndex: number) {
    const day = DAY_KEYS[dayIndex];
    const slot = availability[day];
    const active = slot?.enabled;

    return (
      <div key={day} className="space-y-1.5">
        <button
          onClick={() => toggleDay(day)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
            active
              ? 'bg-tribe-green text-slate-900'
              : 'bg-stone-100 dark:bg-[#3D4349] text-stone-600 dark:text-gray-400 hover:bg-stone-200 dark:hover:bg-[#52575D]'
          }`}
        >
          <span>{days[dayIndex]}</span>
          {!active && (
            <span className="ml-1.5 text-xs text-stone-400 dark:text-gray-500">
              {isEs ? 'No disponible' : 'Not available'}
            </span>
          )}
        </button>
        {active && (
          <div className="flex items-center gap-1.5 px-1">
            <select
              value={slot.start}
              onChange={(e) => updateDayTime(day, 'start', e.target.value)}
              className="text-xs rounded-lg px-1.5 py-1 bg-stone-100 dark:bg-[#3D4349] text-theme-primary border-0 flex-1 min-w-0"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span className="text-stone-400 text-xs">-</span>
            <select
              value={slot.end}
              onChange={(e) => updateDayTime(day, 'end', e.target.value)}
              className="text-xs rounded-lg px-1.5 py-1 bg-stone-100 dark:bg-[#3D4349] text-theme-primary border-0 flex-1 min-w-0"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sports Selection */}
      <div>
        <h3 className="text-sm font-semibold text-theme-primary mb-3">
          {isEs ? 'Deportes preferidos' : 'Preferred sports'}
        </h3>
        <div className="flex flex-wrap gap-2">
          {SPORTS_LIST.filter((s) => s !== 'Other').map((sport) => {
            const active = selectedSports.includes(sport);
            return (
              <button
                key={sport}
                onClick={() => toggleSport(sport)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                  active
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-stone-100 dark:bg-[#3D4349] text-stone-700 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-[#52575D]'
                }`}
              >
                {active && <Check className="w-3 h-3 inline mr-1" />}
                {SPORTS_TRANSLATIONS[sport as Sport]?.[language] || sport}
              </button>
            );
          })}
        </div>
      </div>

      {/* Availability — 2-column grid: Mon-Thu | Fri-Sun */}
      <div>
        <h3 className="text-sm font-semibold text-theme-primary mb-3">{isEs ? 'Disponibilidad' : 'Availability'}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">{leftDays.map(renderDayToggle)}</div>
          <div className="space-y-2">{rightDays.map(renderDayToggle)}</div>
        </div>
      </div>

      {/* Gender Preference */}
      <div>
        <h3 className="text-sm font-semibold text-theme-primary mb-3">
          {isEs ? 'Preferencia de compañero' : 'Partner preference'}
        </h3>
        <div className="flex gap-2">
          {[
            { value: 'any' as const, en: 'Anyone', es: 'Cualquiera' },
            { value: 'male' as const, en: 'Men', es: 'Hombres' },
            { value: 'female' as const, en: 'Women', es: 'Mujeres' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGenderPref(opt.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                genderPref === opt.value
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-stone-100 dark:bg-[#3D4349] text-stone-700 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-[#52575D]'
              }`}
            >
              {isEs ? opt.es : opt.en}
            </button>
          ))}
        </div>
      </div>

      {/* Max Distance */}
      <div>
        <h3 className="text-sm font-semibold text-theme-primary mb-3">
          {isEs ? 'Distancia máxima' : 'Max distance'}: {maxDistance} km
        </h3>
        <div className="flex gap-2 flex-wrap">
          {DISTANCE_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setMaxDistance(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                maxDistance === d
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-stone-100 dark:bg-[#3D4349] text-stone-700 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-[#52575D]'
              }`}
            >
              {d} km
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      <Button
        onClick={handleSave}
        disabled={saving || selectedSports.length === 0}
        className="w-full bg-tribe-green text-slate-900 hover:bg-[#b0d853] font-semibold py-3 rounded-xl disabled:opacity-50"
      >
        {saving ? (isEs ? 'Guardando...' : 'Saving...') : isEs ? 'Guardar preferencias' : 'Save preferences'}
      </Button>

      {/* Matching Instructors — always shown after save or if preferences exist */}
      {saved && <MatchingInstructorResults selectedSports={selectedSports} />}
    </div>
  );
}
