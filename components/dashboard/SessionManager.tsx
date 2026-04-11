'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, Users, ChevronDown, ChevronUp, Plus, XCircle, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { sportTranslations } from '@/lib/translations';
import type { InstructorSessionRow } from '@/lib/dal/instructorDashboard';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';

interface SessionManagerProps {
  language: 'en' | 'es';
  upcoming: InstructorSessionRow[];
  past: InstructorSessionRow[];
}

export default function SessionManager({ language, upcoming, past }: SessionManagerProps) {
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
        className={`p-4 bg-white dark:bg-[#3D4349] rounded-xl border border-stone-200 dark:border-[#52575D] ${isCancelled ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-tribe-green/20 text-tribe-green text-xs px-2 py-0.5 border-0">{sportLabel}</Badge>
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
        <div className="p-6 text-center bg-white dark:bg-[#3D4349] rounded-xl border border-stone-200 dark:border-[#52575D]">
          <Calendar className="w-8 h-8 text-theme-secondary mx-auto mb-2" />
          <p className="text-sm text-theme-secondary">{txt.noUpcoming}</p>
        </div>
      ) : (
        <div className="space-y-3">{upcoming.map(renderSessionRow)}</div>
      )}

      {/* Past Sessions Toggle */}
      {past.length > 0 && (
        <>
          <button
            onClick={() => setShowPast(!showPast)}
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
