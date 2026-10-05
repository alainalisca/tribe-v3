'use client';

/**
 * T-AV29 (P1-2). The coach's own switch for the WhatsApp contact button, on the
 * instructor dashboard. Behind the athlete_value feature "contact".
 *
 * The number is normalized with lib/pase/phone (the same rules the Pass form
 * uses) and stored in E.164. Opting in needs a number; opting out keeps the
 * number saved so switching back on is one tap.
 */
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { showError, showSuccess } from '@/lib/toast';
import { normalizeWhatsApp } from '@/lib/pase/phone';
import { useAthleteValueFeature } from '@/lib/features/useAthleteValueFeature';
import { fetchMyContactSettings, saveWhatsAppContact } from '@/lib/dal/coachContact';
import { CONTACT_FEATURE } from './CoachContactButtons';

interface Props {
  coachId: string;
  language: 'en' | 'es';
}

export default function CoachContactSettings({ coachId, language }: Props) {
  const enabled = useAthleteValueFeature(CONTACT_FEATURE);
  const [optIn, setOptIn] = useState(false);
  const [number, setNumber] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const es = language === 'es';

  useEffect(() => {
    if (!enabled) return;
    void fetchMyContactSettings(createClient(), coachId).then((r) => {
      if (r.success && r.data) {
        setOptIn(r.data.whatsapp_opt_in);
        setNumber(r.data.whatsapp_e164 ?? '');
      }
      setLoaded(true);
    });
  }, [enabled, coachId]);

  if (!enabled || !loaded) return null;

  async function save() {
    const e164 = number.trim() === '' ? null : normalizeWhatsApp(number);
    if (number.trim() !== '' && !e164) {
      showError(es ? 'Ese número de WhatsApp no es válido.' : 'That WhatsApp number is not valid.');
      return;
    }
    if (optIn && !e164) {
      showError(
        es ? 'Escribe tu número de WhatsApp para mostrar el botón.' : 'Add your WhatsApp number to show the button.'
      );
      return;
    }
    setSaving(true);
    const r = await saveWhatsAppContact(createClient(), optIn, e164);
    setSaving(false);
    if (!r.success) {
      showError(es ? 'No se pudo guardar. Intenta de nuevo.' : 'Could not save. Please try again.');
      return;
    }
    if (e164) setNumber(e164);
    showSuccess(es ? 'Guardado' : 'Saved');
  }

  return (
    <Card className="dark:bg-tribe-card">
      <CardContent className="p-4 space-y-3">
        <h3 className="font-bold text-theme-primary">{es ? 'Contacto por WhatsApp' : 'WhatsApp contact'}</h3>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="w-5 h-5" />
          <span className="text-sm text-theme-primary">
            {es
              ? 'Mostrar un botón de WhatsApp en mi perfil y en mis sesiones'
              : 'Show a WhatsApp button on my profile and on my sessions'}
          </span>
        </label>
        <input
          type="tel"
          inputMode="tel"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="+57 300 111 2233"
          aria-label={es ? 'Tu número de WhatsApp' : 'Your WhatsApp number'}
          className="w-full px-3 py-3 rounded-lg border border-stone-300 dark:border-tribe-mid bg-white dark:bg-tribe-mid text-base"
        />
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
