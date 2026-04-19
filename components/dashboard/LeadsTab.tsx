'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MessageCircle, UserIcon, X, ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchInterestForInstructor,
  updateInterestStatus,
  type TrainingInterestWithAthlete,
  type TrainingInterestStatus,
} from '@/lib/dal/trainingInterest';
import { showSuccess, showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { sportTranslations } from '@/lib/translations';

interface LeadsTabProps {
  instructorId: string;
  language: 'en' | 'es';
}

function formatRelative(iso: string, language: 'en' | 'es'): string {
  const diffDay = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (language === 'es') {
    if (diffDay === 0) return 'hoy';
    if (diffDay === 1) return 'ayer';
    return `hace ${diffDay} días`;
  }
  if (diffDay === 0) return 'today';
  if (diffDay === 1) return 'yesterday';
  return `${diffDay} days ago`;
}

export default function LeadsTab({ instructorId, language }: LeadsTabProps) {
  const supabase = createClient();
  const [active, setActive] = useState<TrainingInterestWithAthlete[]>([]);
  const [contacted, setContacted] = useState<TrainingInterestWithAthlete[]>([]);
  const [dismissed, setDismissed] = useState<TrainingInterestWithAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDismissed, setShowDismissed] = useState(false);

  const t = {
    title: language === 'es' ? 'Interesados' : 'Leads',
    empty:
      language === 'es'
        ? 'Aún ningún atleta ha expresado interés. Completa tu perfil y ofrece grandes sesiones — ¡los atletas interesados aparecerán aquí!'
        : 'No athletes have expressed interest yet. Complete your profile and host great sessions — interested athletes will show up here!',
    active: language === 'es' ? 'Activos' : 'Active',
    contacted: language === 'es' ? 'Contactados' : 'Contacted',
    dismissed: language === 'es' ? 'Descartados' : 'Dismissed',
    viewProfile: language === 'es' ? 'Ver Perfil' : 'View Profile',
    message: language === 'es' ? 'Mensaje' : 'Message',
    dismiss: language === 'es' ? 'Descartar' : 'Dismiss',
    loading: language === 'es' ? 'Cargando…' : 'Loading…',
    markContacted: language === 'es' ? 'Marcado como contactado' : 'Marked as contacted',
    dismissed_ok: language === 'es' ? 'Descartado' : 'Dismissed',
    error: language === 'es' ? 'Ocurrió un error' : 'Something went wrong',
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [a, c, d] = await Promise.all([
      fetchInterestForInstructor(supabase, instructorId, 'active'),
      fetchInterestForInstructor(supabase, instructorId, 'contacted'),
      fetchInterestForInstructor(supabase, instructorId, 'dismissed'),
    ]);
    if (a.success && a.data) setActive(a.data.interests);
    if (c.success && c.data) setContacted(c.data.interests);
    if (d.success && d.data) setDismissed(d.data.interests);
    setLoading(false);
  }, [instructorId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (interestId: string, newStatus: Exclude<TrainingInterestStatus, 'active'>) => {
    const res = await updateInterestStatus(supabase, interestId, instructorId, newStatus);
    if (!res.success) {
      showError(res.error || t.error);
      return;
    }
    await haptic('success');
    showSuccess(newStatus === 'contacted' ? t.markContacted : t.dismissed_ok);
    load();
  };

  const renderCard = (entry: TrainingInterestWithAthlete, showActions: boolean) => {
    if (!entry.athlete) return null;
    const sportLabel = entry.sport
      ? language === 'es'
        ? sportTranslations[entry.sport]?.es || entry.sport
        : sportTranslations[entry.sport]?.en || entry.sport
      : '';
    return (
      <li
        key={entry.id}
        className="bg-white dark:bg-tribe-surface rounded-2xl p-4 border border-stone-200 dark:border-tribe-mid"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-stone-200 dark:bg-[#272D34] overflow-hidden flex-shrink-0 relative">
            {entry.athlete.avatar_url ? (
              <Image
                src={entry.athlete.avatar_url}
                alt={entry.athlete.name}
                fill
                sizes="40px"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-stone-500">
                {(entry.athlete.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-theme-primary truncate">{entry.athlete.name}</p>
              <span className="text-xs text-theme-secondary flex-shrink-0">
                {formatRelative(entry.created_at, language)}
              </span>
            </div>
            {(sportLabel || entry.athlete.location) && (
              <p className="text-xs text-theme-secondary mt-0.5">
                {sportLabel}
                {sportLabel && entry.athlete.location ? ' · ' : ''}
                {entry.athlete.location || ''}
              </p>
            )}
            {entry.message && <p className="mt-2 text-sm text-theme-primary italic">“{entry.message}”</p>}
          </div>
        </div>
        {showActions && (
          <div className="mt-3 flex gap-2">
            <Link
              href={`/profile/${entry.athlete.id}`}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-stone-100 dark:bg-[#272D34] text-theme-primary text-xs font-semibold hover:bg-stone-200"
            >
              <UserIcon className="w-3.5 h-3.5" />
              {t.viewProfile}
            </Link>
            <Link
              href={`/messages?to=${entry.athlete.id}`}
              onClick={() => updateStatus(entry.id, 'contacted')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#84cc16] text-slate-900 text-xs font-bold"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {t.message}
            </Link>
            <button
              type="button"
              onClick={() => updateStatus(entry.id, 'dismissed')}
              className="px-3 py-2 rounded-lg bg-stone-100 dark:bg-[#272D34] text-theme-secondary text-xs font-semibold hover:text-theme-primary"
              aria-label={t.dismiss}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </li>
    );
  };

  if (loading) {
    return <div className="py-8 text-center text-sm text-theme-secondary">{t.loading}</div>;
  }

  const totalActive = active.length + contacted.length;

  if (totalActive === 0 && dismissed.length === 0) {
    return (
      <div className="bg-white dark:bg-tribe-surface rounded-2xl p-6 text-center border border-stone-200 dark:border-tribe-mid">
        <p className="text-sm text-theme-secondary">{t.empty}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {active.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-theme-secondary mb-2 font-semibold">
            {t.active} ({active.length})
          </h3>
          <ul className="space-y-2">{active.map((e) => renderCard(e, true))}</ul>
        </section>
      )}

      {contacted.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-theme-secondary mb-2 font-semibold">
            {t.contacted} ({contacted.length})
          </h3>
          <ul className="space-y-2">{contacted.map((e) => renderCard(e, false))}</ul>
        </section>
      )}

      {dismissed.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowDismissed((v) => !v)}
            className="flex items-center gap-1 text-xs text-theme-secondary hover:text-theme-primary font-semibold uppercase tracking-wide"
          >
            {showDismissed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {t.dismissed} ({dismissed.length})
          </button>
          {showDismissed && <ul className="space-y-2 mt-2">{dismissed.map((e) => renderCard(e, false))}</ul>}
        </section>
      )}
    </div>
  );
}
