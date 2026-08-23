'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, Users, ChevronDown, ChevronUp, Plus, XCircle, Copy, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { sportTranslations } from '@/lib/translations';
import type { InstructorSessionRow } from '@/lib/dal/instructorDashboard';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';
import { formatPattern } from '@/lib/recurrence';
import { bogotaToday } from '@/lib/time/bogotaDate';

interface SessionManagerProps {
  language: 'en' | 'es';
  upcoming: InstructorSessionRow[];
  past: InstructorSessionRow[];
  series: InstructorSessionRow[];
  onEndSeries: (seriesId: string) => void;
}

export default function SessionManager({ language, upcoming, past, series, onEndSeries }: SessionManagerProps) {
  const [showPast, setShowPast] = useState(false);

  const txt = {
    upcoming: language === 'es' ? 'Proximas Sesiones' : 'Upcoming Sessions',
    past: language === 'es' ? 'Sesiones Pasadas' : 'Past Sessions',
    createNew: language === 'es' ? 'Crear Sesion' : 'Create Session',
    noUpcoming: language === 'es' ? 'No tienes sesiones programadas' : 'No upcoming sessions scheduled',
    spots: language === 'es' ? 'cupos' : 'spots',
    cancelled: language === 'es' ? 'Cancelada' : 'Cancelled',
    free: language === 'es' ? 'Gratis' : 'Free',
    edit: language === 'es' ? 'Editar' : 'Edit',
    showPast: language === 'es' ? 'Mostrar Pasadas' : 'Show Past',
    hidePast: language === 'es' ? 'Ocultar Pasadas' : 'Hide Past',
    seriesSectionTitle: language === 'es' ? 'Series Recurrentes' : 'Recurring Series',
    seriesTemplate: language === 'es' ? 'Plantilla de serie' : 'Series template',
    seriesBadge: language === 'es' ? 'Serie' : 'Series',
    endSeries: language === 'es' ? 'Terminar serie' : 'End series',
    seriesEnded: language === 'es' ? 'Finalizada' : 'Ended',
  };

  function formatSessionDate(dateStr: string, timeStr: string): string {
    const date = new Date(dateStr + 'T' + timeStr);
    return date.toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function renderSessionRow(session: InstructorSessionRow) {
    const sportLabel = language === 'es' ? sportTranslations[session.sport]?.es || session.sport : session.sport;
    const isCancelled = session.status === 'cancelled';
    const price =
      session.price_cents && session.price_cents > 0
        ? formatPrice(session.price_cents, (session.currency as Currency) || 'COP')
        : txt.free;

    return (
      <div
        key={session.id}
        className={`p-4 bg-white dark:bg-tribe-surface rounded-xl border border-stone-200 dark:border-tribe-mid ${isCancelled ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge className="bg-tribe-green/20 text-tribe-green text-xs px-2 py-0.5 border-0">{sportLabel}</Badge>
              {/* Gate 5: flag any row that belongs to a recurring series (a child
                  occurrence, or a parent that surfaces outside the series section). */}
              {(session.is_recurring || session.recurring_parent_id) && (
                <Badge className="bg-tribe-sky text-tribe-dark text-xs px-2 py-0.5 border-0 flex items-center gap-1">
                  <Repeat className="w-3 h-3" />
                  {txt.seriesBadge}
                </Badge>
              )}
              {isCancelled && (
                <Badge variant="destructive" className="text-xs px-2 py-0.5">
                  {txt.cancelled}
                </Badge>
              )}
            </div>
            <h4 className="text-sm font-semibold text-theme-primary truncate">{session.title || sportLabel}</h4>
            <div className="flex items-center gap-3 mt-1 text-xs text-theme-secondary">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatSessionDate(session.date, session.start_time)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {session.participant_count}/{session.max_participants} {txt.spots}
              </span>
              <span className="font-medium text-theme-primary">{price}</span>
            </div>
          </div>
          {!isCancelled && (
            <Link href={`/session/${session.id}`}>
              <Button variant="ghost" size="sm" className="text-xs text-tribe-green">
                {txt.edit}
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  function renderSeriesRow(session: InstructorSessionRow) {
    const sportLabel = language === 'es' ? sportTranslations[session.sport]?.es || session.sport : session.sport;
    const price =
      session.price_cents && session.price_cents > 0
        ? formatPrice(session.price_cents, (session.currency as Currency) || 'COP')
        : txt.free;
    // A series is "ended" once its recurrence_end_date is in the past: the cron
    // will generate nothing more, so the end action no longer applies. Compare
    // against Bogotá today, the same calendar the cron and end date use.
    const ended = !!session.recurrence_end_date && session.recurrence_end_date.slice(0, 10) < bogotaToday();
    // Cadence comes from the PARENT'S pattern only, never a child's date (H1).
    const cadence = formatPattern(session.recurrence_pattern, language);

    return (
      <div
        key={session.id}
        className={`p-4 bg-white dark:bg-tribe-surface rounded-xl border border-stone-200 dark:border-tribe-mid ${ended ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge className="bg-tribe-green/20 text-tribe-green text-xs px-2 py-0.5 border-0">{sportLabel}</Badge>
              <Badge className="bg-tribe-sky text-tribe-dark text-xs px-2 py-0.5 border-0 flex items-center gap-1">
                <Repeat className="w-3 h-3" />
                {txt.seriesTemplate}
              </Badge>
              {ended && (
                <Badge variant="destructive" className="text-xs px-2 py-0.5">
                  {txt.seriesEnded}
                </Badge>
              )}
            </div>
            <h4 className="text-sm font-semibold text-theme-primary truncate">{session.title || sportLabel}</h4>
            {/* Show the CADENCE, never the parent's stale seed date. */}
            <div className="flex items-center gap-3 mt-1 text-xs text-theme-secondary">
              <span className="flex items-center gap-1">
                <Repeat className="w-3 h-3" />
                {cadence}
              </span>
              <span className="font-medium text-theme-primary">{price}</span>
            </div>
          </div>
          {!ended && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-tribe-red shrink-0"
              onClick={() => onEndSeries(session.id)}
            >
              <XCircle className="w-3.5 h-3.5 mr-1" />
              {txt.endSeries}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Create New CTA */}
      <Link href="/create">
        <Button className="w-full py-3 font-semibold">
          <Plus className="w-4 h-4 mr-2" />
          {txt.createNew}
        </Button>
      </Link>

      {/* Upcoming Sessions */}
      <h3 className="text-sm font-semibold text-theme-secondary uppercase tracking-wide">
        {txt.upcoming} ({upcoming.length})
      </h3>

      {upcoming.length === 0 ? (
        <div className="p-6 text-center bg-white dark:bg-tribe-surface rounded-xl border border-stone-200 dark:border-tribe-mid">
          <Calendar className="w-8 h-8 text-theme-secondary mx-auto mb-2" />
          <p className="text-sm text-theme-secondary">{txt.noUpcoming}</p>
        </div>
      ) : (
        <div className="space-y-3">{upcoming.map(renderSessionRow)}</div>
      )}

      {/* Recurring Series — always visible, never subject to the past-list cap.
          This is what makes a series template findable: a parent carries a past
          seed date, so without its own section it sinks below the past cut and
          the instructor can never reach it (T-RECUR1 Gate 3). */}
      {series.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-theme-secondary uppercase tracking-wide">
            {txt.seriesSectionTitle} ({series.length})
          </h3>
          <div className="space-y-3">{series.map(renderSeriesRow)}</div>
        </>
      )}

      {/* Past Sessions Toggle */}
      {past.length > 0 && (
        <>
          <button
            onClick={() => setShowPast(!showPast)}
            aria-label={showPast ? 'Hide past sessions' : 'Show past sessions'}
            className="flex items-center gap-2 text-sm text-tribe-green font-medium hover:underline"
          >
            {showPast ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showPast ? txt.hidePast : txt.showPast} ({past.length})
          </button>
          {showPast && <div className="space-y-3">{past.slice(0, 20).map(renderSessionRow)}</div>}
        </>
      )}
    </div>
  );
}
