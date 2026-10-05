'use client';

/**
 * T-AV32 (P1-5). The coach writes, once, what someone should know before
 * their first class. Shown on the coach's sessions to people who have never
 * been. Behind the athlete_value feature "first_timer".
 */
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { showError, showSuccess } from '@/lib/toast';
import { useAthleteValueFeature } from '@/lib/features/useAthleteValueFeature';
import { FIRST_TIMER_MAX, fetchMyFirstTimerText, saveFirstTimerText } from '@/lib/dal/firstTimer';
import { FIRST_TIMER_FEATURE } from './FirstTimerBlock';

export default function FirstTimerSettings({ coachId, language }: { coachId: string; language: 'en' | 'es' }) {
  const enabled = useAthleteValueFeature(FIRST_TIMER_FEATURE);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const es = language === 'es';

  useEffect(() => {
    if (!enabled) return;
    void fetchMyFirstTimerText(createClient(), coachId).then((r) => {
      if (r.success) setText(r.data ?? '');
      setLoaded(true);
    });
  }, [enabled, coachId]);

  if (!enabled || !loaded) return null;

  async function save() {
    const value = text.trim();
    if (value.length > FIRST_TIMER_MAX) {
      showError(es ? `Máximo ${FIRST_TIMER_MAX} caracteres.` : `${FIRST_TIMER_MAX} characters at most.`);
      return;
    }
    setSaving(true);
    const r = await saveFirstTimerText(createClient(), value === '' ? null : value);
    setSaving(false);
    if (!r.success) {
      showError(es ? 'No se pudo guardar. Intenta de nuevo.' : 'Could not save. Please try again.');
      return;
    }
    showSuccess(es ? 'Guardado' : 'Saved');
  }

  return (
    <Card className="dark:bg-tribe-card">
      <CardContent className="p-4 space-y-3">
        <label htmlFor="first-timer-text" className="block font-bold text-theme-primary">
          {es ? 'Para quien viene por primera vez' : 'For someone coming for the first time'}
        </label>
        <p className="text-sm text-theme-secondary">
          {es
            ? 'Lo ven solo las personas que nunca han entrenado contigo, en tus sesiones.'
            : 'Only people who have never trained with you see this, on your sessions.'}
        </p>
        <textarea
          id="first-timer-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={FIRST_TIMER_MAX}
          placeholder={
            es
              ? 'Ej: Llega 10 minutos antes, trae agua y pregunta por mí en la entrada.'
              : 'E.g. Arrive 10 minutes early, bring water and ask for me at the door.'
          }
          className="w-full px-3 py-3 rounded-lg border border-stone-300 dark:border-tribe-mid bg-white dark:bg-tribe-mid text-base"
        />
        <p className="text-xs text-theme-secondary text-right">
          {text.length}/{FIRST_TIMER_MAX}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-lg bg-tribe-green text-tribe-dark font-bold disabled:opacity-60"
        >
          {es ? 'Guardar' : 'Save'}
        </button>
      </CardContent>
    </Card>
  );
}
