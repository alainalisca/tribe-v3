'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { Settings as SettingsIcon } from 'lucide-react';

const copy = {
  en: {
    pageTitle: 'Settings',
    loading: 'Loading',
    redirecting: 'Redirecting',
    gymSettingsLink: 'Gym settings',
    autonomyTitle: 'Sequence autonomy',
    autonomyHint: 'The system never sends messages. This controls how follow-up sequences start for at-risk members.',
    manual: 'Manual',
    manualDesc: 'You start each sequence yourself.',
    suggest: 'Suggest',
    suggestDesc: 'The system creates suggestions. You approve before they begin.',
    auto: 'Automatic',
    autoDesc: 'Sequences start automatically for qualifying members.',
    saving: 'Saving...',
    saved: 'Saved',
    ownerOnly: 'Only the gym owner can change this setting.',
  },
  es: {
    pageTitle: 'Ajustes',
    loading: 'Cargando',
    redirecting: 'Redirigiendo',
    gymSettingsLink: 'Ajustes del gym',
    autonomyTitle: 'Autonomía de seguimiento',
    autonomyHint: 'El sistema nunca envía mensajes. Esto controla cómo inician las secuencias de seguimiento para miembros en riesgo.',
    manual: 'Manual',
    manualDesc: 'Tu inicias cada secuencia.',
    suggest: 'Sugerir',
    suggestDesc: 'El sistema crea sugerencias. Tu apruebas antes de que comiencen.',
    auto: 'Automático',
    autoDesc: 'Las secuencias inician automáticamente para miembros que califiquen.',
    saving: 'Guardando...',
    saved: 'Guardado',
    ownerOnly: 'Solo el dueño del gym puede cambiar este ajuste.',
  },
} as const;

type Autonomy = 'manual' | 'suggest' | 'auto';

export default function SettingsPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [autonomy, setAutonomy] = useState<Autonomy>('manual');
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tribe-os/sequences/settings');
      const json = await res.json();
      if (json.success) {
        setAutonomy(json.data.autonomy ?? 'manual');
        setIsOwner(json.data.isOwner ?? false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (gate.state === 'allowed') fetchSettings();
  }, [gate.state, fetchSettings]);

  const handleChange = async (value: Autonomy) => {
    if (!isOwner || saving) return;
    setAutonomy(value);
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/tribe-os/sequences/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autonomy: value }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_autonomy_changed', { value });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-tribe-dark-80 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirecting : s.loading}...
        </p>
      </main>
    );
  }

  const options: { value: Autonomy; label: string; desc: string }[] = [
    { value: 'manual', label: s.manual, desc: s.manualDesc },
    { value: 'suggest', label: s.suggest, desc: s.suggestDesc },
    { value: 'auto', label: s.auto, desc: s.autoDesc },
  ];

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-tribe-dark">{s.pageTitle}</h1>
        </header>

        <a
          href="/os/gym"
          className="inline-flex items-center gap-2 text-sm font-medium text-tribe-green-dark hover:underline"
        >
          <SettingsIcon className="h-4 w-4" />
          {s.gymSettingsLink}
        </a>

        {loading ? (
          <p className="text-tribe-dark-80 text-sm py-8 text-center">{s.loading}...</p>
        ) : (
          <section className="bg-white rounded-tribe shadow-tribe p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-tribe-dark">{s.autonomyTitle}</h2>
              <p className="text-xs text-tribe-dark-80 mt-1">{s.autonomyHint}</p>
            </div>

            {!isOwner && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-tribe px-3 py-2">{s.ownerOnly}</p>
            )}

            <div className="space-y-2">
              {options.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-tribe border transition-colors cursor-pointer ${
                    autonomy === opt.value
                      ? 'border-tribe-green bg-tribe-green-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  } ${!isOwner ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="autonomy"
                    value={opt.value}
                    checked={autonomy === opt.value}
                    onChange={() => handleChange(opt.value)}
                    disabled={!isOwner || saving}
                    className="mt-0.5 h-4 w-4 text-tribe-green focus:ring-tribe-green border-gray-300"
                  />
                  <div>
                    <span className="text-sm font-semibold text-tribe-dark">{opt.label}</span>
                    <p className="text-xs text-tribe-dark-80 mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {saving && <p className="text-xs text-tribe-dark-80">{s.saving}</p>}
            {saved && <p className="text-xs text-tribe-green-dark font-medium">{s.saved}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
