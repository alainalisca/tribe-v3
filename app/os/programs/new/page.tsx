'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { showError, showSuccess } from '@/lib/toast';
import { Button } from '@/components/tribe-os/ui';
import {
  PROGRAM_STATUSES,
  PROGRAM_NAME_MAX,
  PROGRAM_DESCRIPTION_MAX,
  PROGRAM_SPORT_MAX,
  TARGET_SESSIONS_MIN,
  TARGET_SESSIONS_MAX,
} from '@/lib/tribe-os/programs/constants';
import type { ProgramStatus } from '@/lib/tribe-os/programs/constants';

const copy = {
  en: {
    pageTitle: 'New Program',
    back: 'Programs',
    loading: 'Loading',
    redirecting: 'Redirecting',
    name: 'Program name',
    namePlaceholder: 'e.g. HYROX 8-Week Block',
    description: 'Description',
    descPlaceholder: 'Optional details about this training block…',
    sport: 'Sport / discipline',
    sportPlaceholder: 'e.g. CrossFit, HYROX, Weightlifting',
    status: 'Status',
    statusLabels: { draft: 'Draft', active: 'Active', archived: 'Archived' } as Record<string, string>,
    target: 'Target sessions per week',
    startDate: 'Start date',
    endDate: 'End date',
    save: 'Create program',
    saving: 'Creating…',
    errorCreate: 'Could not create program. Try again.',
    successCreate: 'Program created',
  },
  es: {
    pageTitle: 'Nuevo programa',
    back: 'Programas',
    loading: 'Cargando',
    redirecting: 'Redirigiendo',
    name: 'Nombre del programa',
    namePlaceholder: 'ej. Bloque HYROX 8 semanas',
    description: 'Descripción',
    descPlaceholder: 'Detalles opcionales de este bloque de entrenamiento…',
    sport: 'Deporte / disciplina',
    sportPlaceholder: 'ej. CrossFit, HYROX, Halterofilia',
    status: 'Estado',
    statusLabels: { draft: 'Borrador', active: 'Activo', archived: 'Archivado' } as Record<string, string>,
    target: 'Sesiones objetivo por semana',
    startDate: 'Fecha de inicio',
    endDate: 'Fecha de fin',
    save: 'Crear programa',
    saving: 'Creando…',
    errorCreate: 'No se pudo crear el programa. Intenta de nuevo.',
    successCreate: 'Programa creado',
  },
} as const;

export default function NewProgramPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sport, setSport] = useState('');
  const [status, setStatus] = useState<ProgramStatus>('draft');
  const [target, setTarget] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tribe-os/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          sport: sport.trim() || null,
          status,
          starts_at: startsAt || null,
          ends_at: endsAt || null,
          target_sessions_per_week: target ? parseInt(target, 10) : null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_program_created');
        showSuccess(s.successCreate);
        router.push(`/os/programs/${json.data.id}`);
      } else {
        showError(s.errorCreate);
      }
    } catch {
      showError(s.errorCreate);
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

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/os/programs"
          className="inline-flex items-center gap-1 text-xs text-tribe-blue hover:underline mb-4"
        >
          <ArrowLeft className="h-3 w-3" />
          {s.back}
        </Link>

        <h1 className="text-2xl font-black text-tribe-dark mb-6">{s.pageTitle}</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-tribe-dark-80 uppercase tracking-wider mb-1">
              {s.name}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={PROGRAM_NAME_MAX}
              placeholder={s.namePlaceholder}
              required
              className="w-full px-3 py-2 rounded-tribe border border-tribe-dark/10 text-sm focus:outline-none focus:ring-2 focus:ring-tribe-blue/30"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-tribe-dark-80 uppercase tracking-wider mb-1">
              {s.description}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={PROGRAM_DESCRIPTION_MAX}
              placeholder={s.descPlaceholder}
              rows={3}
              className="w-full px-3 py-2 rounded-tribe border border-tribe-dark/10 text-sm focus:outline-none focus:ring-2 focus:ring-tribe-blue/30 resize-none"
            />
          </div>

          {/* Sport */}
          <div>
            <label className="block text-xs font-bold text-tribe-dark-80 uppercase tracking-wider mb-1">
              {s.sport}
            </label>
            <input
              type="text"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              maxLength={PROGRAM_SPORT_MAX}
              placeholder={s.sportPlaceholder}
              className="w-full px-3 py-2 rounded-tribe border border-tribe-dark/10 text-sm focus:outline-none focus:ring-2 focus:ring-tribe-blue/30"
            />
          </div>

          {/* Status + Target */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-tribe-dark-80 uppercase tracking-wider mb-1">
                {s.status}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProgramStatus)}
                className="w-full px-3 py-2 rounded-tribe border border-tribe-dark/10 text-sm focus:outline-none focus:ring-2 focus:ring-tribe-blue/30 bg-white"
              >
                {PROGRAM_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {s.statusLabels[st]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-tribe-dark-80 uppercase tracking-wider mb-1">
                {s.target}
              </label>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                min={TARGET_SESSIONS_MIN}
                max={TARGET_SESSIONS_MAX}
                placeholder="3"
                className="w-full px-3 py-2 rounded-tribe border border-tribe-dark/10 text-sm focus:outline-none focus:ring-2 focus:ring-tribe-blue/30"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-tribe-dark-80 uppercase tracking-wider mb-1">
                {s.startDate}
              </label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full px-3 py-2 rounded-tribe border border-tribe-dark/10 text-sm focus:outline-none focus:ring-2 focus:ring-tribe-blue/30"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-tribe-dark-80 uppercase tracking-wider mb-1">
                {s.endDate}
              </label>
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                min={startsAt || undefined}
                className="w-full px-3 py-2 rounded-tribe border border-tribe-dark/10 text-sm focus:outline-none focus:ring-2 focus:ring-tribe-blue/30"
              />
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving ? s.saving : s.save}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
