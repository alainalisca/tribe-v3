'use client';

/**
 * T-AV33 (P1-6). The coach writes a welcome note once. Tribe sends it to a
 * person on their first join or Pass claim with this coach, within the T-AV
 * notification cap. Behind the athlete_value feature "welcome".
 */
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { showError, showSuccess } from '@/lib/toast';
import { useAthleteValueFeature } from '@/lib/features/useAthleteValueFeature';
import { WELCOME_NOTE_MAX, fetchMyWelcomeNote, saveWelcomeNote } from '@/lib/dal/coachWelcome';

export const WELCOME_FEATURE = 'welcome';

export default function WelcomeNoteSettings({ coachId, language }: { coachId: string; language: 'en' | 'es' }) {
  const enabled = useAthleteValueFeature(WELCOME_FEATURE);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const es = language === 'es';

  useEffect(() => {
    if (!enabled) return;
    void fetchMyWelcomeNote(createClient(), coachId).then((r) => {
      if (r.success) setText(r.data ?? '');
      setLoaded(true);
    });
  }, [enabled, coachId]);

  if (!enabled || !loaded) return null;

  async function save() {
    const value = text.trim();
    if (value.length > WELCOME_NOTE_MAX) {
      showError(es ? `Máximo ${WELCOME_NOTE_MAX} caracteres.` : `${WELCOME_NOTE_MAX} characters at most.`);
      return;
    }
    setSaving(true);
    const r = await saveWelcomeNote(createClient(), value === '' ? null : value);
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
        <label htmlFor="welcome-note" className="block font-bold text-theme-primary">
          {es ? 'Mensaje de bienvenida' : 'Welcome note'}
        </label>
        <p className="text-sm text-theme-secondary">
          {es
            ? 'Le llega una sola vez a cada persona, la primera vez que se une a una de tus sesiones o reclama tu pase.'
            : 'Each person gets it once, the first time they join one of your sessions or claim your pass.'}
        </p>
        <textarea
          id="welcome-note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={WELCOME_NOTE_MAX}
          placeholder={
            es
              ? 'Ej: ¡Qué bueno que vengas! Escríbeme si tienes cualquier duda antes de la clase.'
              : 'E.g. Great to have you! Message me if you have any questions before class.'
          }
          className="w-full px-3 py-3 rounded-lg border border-stone-300 dark:border-tribe-mid bg-white dark:bg-tribe-mid text-base"
        />
        <p className="text-xs text-theme-secondary text-right">
          {text.length}/{WELCOME_NOTE_MAX}
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
