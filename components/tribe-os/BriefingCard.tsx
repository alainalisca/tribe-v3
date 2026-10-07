'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { MessageCircle, ChevronRight, Calendar, CreditCard, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent } from '@/components/tribe-os/ui';
import DraftModal from '@/components/tribe-os/DraftModal';
import type { DraftContext } from '@/lib/tribe-os/drafts/templates';
import type { BriefingData, BriefingContact, BriefingPlanExpiry } from '@/app/api/tribe-os/briefing/route';

type WidgetState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: BriefingData };

function contactToDraftCtx(c: BriefingContact, coachName: string | null): DraftContext {
  return {
    memberId: c.id,
    memberName: c.name,
    phone: c.phone,
    reasons: c.reasons,
    daysSinceLastActivity: c.daysSinceLastActivity,
    lastActivityAt: c.lastActivityAt,
    lastTouchCreatedAt: null,
    cameBack: c.cameBack,
    coachName: c.coachName,
    className: c.className,
    classStartTime: c.classStartTime,
    planEndsOn: c.planEndsOn,
    loggedInCoachName: coachName,
    language: 'es',
  };
}

function planToDraftCtx(p: BriefingPlanExpiry, coachName: string | null): DraftContext {
  const expired = p.planEndsOn < new Date().toISOString().slice(0, 10);
  return {
    memberId: p.id,
    memberName: p.name,
    phone: p.phone,
    reasons: expired ? [`Su plan venció / Plan expired`] : [`Su plan vence / Plan expires`],
    daysSinceLastActivity: p.daysSinceLastActivity,
    lastActivityAt: p.lastActivityAt,
    lastTouchCreatedAt: null,
    coachName: p.coachName,
    className: p.className,
    classStartTime: p.classStartTime,
    planEndsOn: p.planEndsOn,
    loggedInCoachName: coachName,
    language: 'es',
  };
}

function formatTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
      {title}
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] font-bold text-gray-700">
          {count}
        </span>
      )}
    </h3>
  );
}

export default function BriefingCard() {
  const { language } = useLanguage();
  const [state, setState] = useState<WidgetState>({ kind: 'loading' });
  const [draftCtx, setDraftCtx] = useState<DraftContext | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/tribe-os/briefing');
      if (!res.ok) throw new Error('fetch_failed');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setState({ kind: 'ready', data: json.data as BriefingData });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (state.kind === 'loading') {
    return (
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="animate-pulse space-y-3">
            <div className="h-5 bg-gray-200 rounded w-48" />
            <div className="h-3 bg-gray-100 rounded w-64" />
            <div className="h-12 bg-gray-100 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === 'error') return null;

  const { data } = state;
  const coachName = data.coachDisplayName;
  const isEmpty =
    data.contactToday.length === 0 &&
    data.cameBack.length === 0 &&
    data.planExpiry.length === 0 &&
    data.todaySessions.length === 0 &&
    data.unpaidCount === 0;

  return (
    <>
      <Card className="border-l-4 border-l-tribe-green">
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Header */}
          <div>
            <h2 className="text-base sm:text-lg font-black text-gray-900">{data.headerDate}</h2>
            <p className="text-sm text-gray-600 mt-0.5">{data.summary}</p>
          </div>

          {isEmpty && <p className="text-sm text-gray-500 italic">Todo en orden hoy. Nadie en riesgo alto.</p>}

          {/* Contacta hoy */}
          {data.contactToday.length > 0 && (
            <div>
              <SectionHeader title="Contacta hoy" count={data.contactToday.length} />
              <ul className="space-y-1.5">
                {data.contactToday.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-white">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-semibold text-gray-900 truncate block">
                        {c.name ?? 'Sin nombre'}
                      </span>
                      {c.reason && <span className="text-xs text-gray-500 truncate block">{c.reason}</span>}
                    </div>
                    <button
                      onClick={() => setDraftCtx(contactToDraftCtx(c, coachName))}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-green-50 text-green-700 transition"
                      aria-label={`Escribir a ${c.name}`}
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <Link
                href="/os/retention"
                className="inline-flex items-center gap-1 text-xs font-semibold text-tribe-green hover:underline mt-2"
              >
                Ver todos <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          )}

          {/* Volvieron */}
          {data.cameBack.length > 0 && (
            <div>
              <SectionHeader title="Volvieron" count={data.cameBack.length} />
              <div className="flex flex-wrap gap-1.5">
                {data.cameBack.map((cb) => (
                  <span
                    key={cb.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-800 text-xs font-medium"
                  >
                    {cb.name?.split(' ')[0] ?? '—'}
                    <span className="text-green-500 text-[10px]">Volvió</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Planes que vencen */}
          {data.planExpiry.length > 0 && (
            <div>
              <SectionHeader title="Planes que vencen" count={data.planExpiry.length} />
              <ul className="space-y-1.5">
                {data.planExpiry.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-white">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-semibold text-gray-900 truncate block">
                        {p.name ?? 'Sin nombre'}
                      </span>
                      <span className="text-xs text-gray-500">{p.label}</span>
                    </div>
                    <button
                      onClick={() => setDraftCtx(planToDraftCtx(p, coachName))}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-green-50 text-green-700 transition"
                      aria-label={`Escribir a ${p.name}`}
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Clases de hoy */}
          {data.todaySessions.length > 0 && (
            <div>
              <SectionHeader title="Clases de hoy" count={data.todaySessions.length} />
              <ul className="space-y-1">
                {data.todaySessions.map((sess) => (
                  <li key={sess.id} className="flex items-center gap-2 py-1 px-2 text-sm">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="font-medium text-gray-700">{formatTime(sess.startTime)}</span>
                    <span className="text-gray-900 truncate">{sess.title ?? 'Clase'}</span>
                    {sess.currentParticipants !== null && (
                      <span className="text-xs text-gray-500 shrink-0">
                        {sess.currentParticipants}
                        {sess.maxParticipants ? `/${sess.maxParticipants}` : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Pagos pendientes */}
          {data.unpaidCount > 0 && (
            <div>
              <SectionHeader title="Pagos pendientes" />
              <Link
                href="/os/revenue/unpaid"
                className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 transition"
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-900">
                    {data.unpaidCount} cliente{data.unpaidCount > 1 ? 's' : ''} con pagos pendientes
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-600" />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {draftCtx && (
        <DraftModal
          open
          onClose={() => setDraftCtx(null)}
          context={draftCtx}
          onTouchRecorded={() => {
            setDraftCtx(null);
            fetchData();
          }}
        />
      )}
    </>
  );
}
