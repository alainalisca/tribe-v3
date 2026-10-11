'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertCircle, BarChart3, MessageCircle, Users, Clock, Dumbbell } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { formatCents, type Currency } from '@/lib/format/currency';
import { trackEvent } from '@/lib/analytics';

const AnalyticsCharts = dynamic(
  () => import('./_components/AnalyticsCharts').then((m) => ({ default: m.WeeklyBarChart })),
  { ssr: false },
);

const copy = {
  en: {
    title: 'Analytics',
    subtitle: 'Attendance, contact impact, and trends for your gym.',
    loading: 'Loading',
    error: 'Could not load analytics.',
    retry: 'Retry',
    weeks4: '4 wk',
    weeks12: '12 wk',
    weeks26: '26 wk',
    contactEffectTitle: 'Effect of your contacts',
    contactEmpty: 'Contact your first at-risk members to see the effect here.',
    touches: 'Contacts',
    cameBack: 'Came back',
    conversion: 'Conversion',
    recovered: 'Recovered',
    perMonth: '/mo',
    attendanceTitle: 'Attendance',
    totalVisits: 'Total visits',
    uniqueMembers: 'Unique members',
    vsLast: 'vs previous period',
    peakTitle: 'Peak hours',
    classesTitle: 'Classes & coaches',
    className: 'Class',
    coachName: 'Coach',
    visits: 'Visits',
    members: 'Members',
    activeTitle: 'Active members',
    activeSub: 'At least 1 visit in the last 28 days',
    newMembers: 'new',
    returningMembers: 'returning',
    contactsLabel: 'Contacts',
    cameBackLabel: 'Came back',
    inProgress: 'In progress',
  },
  es: {
    title: 'Analítica',
    subtitle: 'Asistencia, impacto de contactos y tendencias de tu gimnasio.',
    loading: 'Cargando',
    error: 'No se pudo cargar la analítica.',
    retry: 'Reintentar',
    weeks4: '4 sem',
    weeks12: '12 sem',
    weeks26: '26 sem',
    contactEffectTitle: 'Efecto de tus contactos',
    contactEmpty: 'Contacta a tus primeros miembros en riesgo para ver el efecto aquí.',
    touches: 'Contactos',
    cameBack: 'Volvieron',
    conversion: 'Conversión',
    recovered: 'Recuperado',
    perMonth: '/mes',
    attendanceTitle: 'Asistencia',
    totalVisits: 'Visitas totales',
    uniqueMembers: 'Miembros únicos',
    vsLast: 'vs periodo anterior',
    peakTitle: 'Horas pico',
    classesTitle: 'Clases y coaches',
    className: 'Clase',
    coachName: 'Coach',
    visits: 'Visitas',
    members: 'Miembros',
    activeTitle: 'Miembros activos',
    activeSub: 'Al menos 1 visita en los últimos 28 días',
    newMembers: 'nuevos',
    returningMembers: 'recurrentes',
    contactsLabel: 'Contactos',
    cameBackLabel: 'Volvieron',
    inProgress: 'En curso',
  },
} as const;

const DOW_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DOW_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface AnalyticsData {
  weeks: number;
  currency: string;
  contact_effect: {
    touches: number;
    came_back: number;
    conversion_pct: number;
    conversion_label: string | null;
    recovered_cents: number;
    weekly: { weekStart: string; label: string; touches: number; cameBack: number }[];
  };
  attendance: {
    weekly: { weekStart: string; label: string; totalVisits: number; uniqueMembers: number }[];
    visit_change_pct: number | null;
    total_visits: number;
    unique_members: number;
  };
  peak_hours: { dow: number; hour: number; count: number }[];
  classes: { className: string; visits: number; uniqueMembers: number }[];
  coaches: { coachName: string; visits: number; uniqueMembers: number }[];
  active_members: { currentActive: number; newThisPeriod: number; returningThisPeriod: number };
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-black tabular-nums">{value}</p>
      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();
  const dows = language === 'es' ? DOW_ES : DOW_EN;

  const [weeks, setWeeks] = useState(12);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (w: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tribe-os/analytics?weeks=${w}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || s.error);
        return;
      }
      setData(json.data as AnalyticsData);
      trackEvent('tribe_os_analytics_viewed');
    } catch {
      setError(s.error);
    } finally {
      setLoading(false);
    }
  }, [s.error]);

  useEffect(() => {
    if (gate.state === 'allowed') fetchData(weeks);
  }, [gate.state, weeks, fetchData]);

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-gray-600 text-sm uppercase tracking-[0.1em]">{s.loading}…</p>
      </main>
    );
  }

  const cur = (data?.currency ?? 'COP') as Currency;

  const peakMax = data ? Math.max(...data.peak_hours.map((c) => c.count), 1) : 1;
  const peakGrid = data ? (() => {
    const map = new Map<string, number>();
    for (const c of data.peak_hours) map.set(`${c.dow}:${c.hour}`, c.count);
    return map;
  })() : new Map<string, number>();

  const hours = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

  return (
    <main className="text-gray-900 px-4 py-8 sm:py-10 pb-24">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#B2E269]/20 text-[#232A31] flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">{s.title}</h1>
            <p className="text-sm text-gray-600 mt-1">{s.subtitle}</p>
          </div>
        </header>

        {/* Range selector */}
        <div className="flex gap-2">
          {([4, 12, 26] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeeks(w)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                weeks === w
                  ? 'bg-[#232A31] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {w === 4 ? s.weeks4 : w === 12 ? s.weeks12 : s.weeks26}
            </button>
          ))}
        </div>

        {loading && <p className="py-12 text-center text-sm text-gray-500">{s.loading}…</p>}

        {error && !loading && (
          <div className="py-12 text-center space-y-4">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
            <p className="text-sm text-gray-700">{error}</p>
            <button type="button" onClick={() => fetchData(weeks)} className="px-4 py-2 bg-white text-gray-900 text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors">
              {s.retry}
            </button>
          </div>
        )}

        {data && !loading && (
          <>
            {/* 1. Contact effect */}
            <section className="rounded-xl bg-white border border-gray-200 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-[#B2E269]" />
                  {s.contactEffectTitle}
                </h2>
                <span className="text-[11px] text-gray-400">{language === 'es' ? 'Últimos 28 días' : 'Last 28 days'}</span>
              </div>
              {data.contact_effect.touches === 0 ? (
                <p className="text-sm text-gray-500 italic py-4">{s.contactEmpty}</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatBox label={s.touches} value={String(data.contact_effect.touches)} />
                    <StatBox label={s.cameBack} value={String(data.contact_effect.came_back)} />
                    <StatBox label={s.conversion} value={data.contact_effect.conversion_label ?? `${data.contact_effect.conversion_pct}%`} />
                    <StatBox
                      label={s.recovered}
                      value={formatCents(data.contact_effect.recovered_cents, cur, language)}
                      sub={s.perMonth}
                    />
                  </div>
                  {data.contact_effect.touches >= 5 && (
                    <AnalyticsCharts
                      data={data.contact_effect.weekly.map((w) => ({
                        label: w.label,
                        value1: w.touches,
                        value2: w.cameBack,
                      }))}
                      label1={s.contactsLabel}
                      label2={s.cameBackLabel}
                      color1="#B2E269"
                      color2="#232A31"
                    />
                  )}
                </>
              )}
            </section>

            {/* 2. Attendance */}
            <section className="rounded-xl bg-white border border-gray-200 p-4 sm:p-5 space-y-4">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#B2E269]" />
                {s.attendanceTitle}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <StatBox label={s.totalVisits} value={data.attendance.total_visits.toLocaleString('es-CO')} />
                <StatBox label={s.uniqueMembers} value={String(data.attendance.unique_members)} />
              </div>
              {data.attendance.visit_change_pct !== null && (
                <p className="text-xs text-gray-500">
                  <span className={data.attendance.visit_change_pct >= 0 ? 'text-green-600' : 'text-red-500'}>
                    {data.attendance.visit_change_pct >= 0 ? '+' : ''}{data.attendance.visit_change_pct}%
                  </span>{' '}
                  {s.vsLast}
                </p>
              )}
              <AnalyticsCharts
                data={data.attendance.weekly.map((w, i) => ({
                  label: i === data!.attendance.weekly.length - 1 ? s.inProgress : w.label,
                  value1: w.totalVisits,
                  value2: w.uniqueMembers,
                  isPartial: i === data!.attendance.weekly.length - 1,
                }))}
                label1={s.totalVisits}
                label2={s.uniqueMembers}
              />
            </section>

            {/* 3. Peak hours */}
            <section className="rounded-xl bg-white border border-gray-200 p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#B2E269]" />
                {s.peakTitle}
              </h2>
              <div className="overflow-x-auto -mx-1 px-1">
                <div className="inline-grid gap-[2px]" style={{
                  gridTemplateColumns: `40px repeat(${hours.length}, 1fr)`,
                  gridTemplateRows: `20px repeat(7, 20px)`,
                  minWidth: `${40 + hours.length * 24}px`,
                }}>
                  <div />
                  {hours.map((h) => (
                    <div key={h} className="text-[9px] text-gray-400 text-center leading-5">
                      {h > 12 ? `${h - 12}p` : h === 12 ? '12p' : `${h}a`}
                    </div>
                  ))}
                  {Array.from({ length: 7 }).map((_, dow) => (
                    <Fragment key={dow}>
                      <div className="text-[10px] text-gray-500 font-medium leading-5 pr-1 text-right">
                        {dows[dow]}
                      </div>
                      {hours.map((h) => {
                        const count = peakGrid.get(`${dow}:${h}`) ?? 0;
                        const intensity = count > 0 ? Math.max(0.15, count / peakMax) : 0;
                        return (
                          <div
                            key={`${dow}:${h}`}
                            className="w-full h-5 rounded-sm"
                            style={{
                              backgroundColor: intensity > 0 ? `rgba(178,226,105,${intensity})` : 'rgba(0,0,0,0.03)',
                            }}
                            title={`${dows[dow]} ${h}:00 — ${count}`}
                          />
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            </section>

            {/* 4. Classes & coaches */}
            <section className="rounded-xl bg-white border border-gray-200 p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Dumbbell className="w-4 h-4 text-[#B2E269]" />
                {s.classesTitle}
              </h2>
              {data.classes.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">{s.className}</p>
                  <div className="space-y-1">
                    {data.classes.map((c) => (
                      <div key={c.className} className="flex items-center justify-between text-sm py-1">
                        <span className="text-gray-800 truncate">{c.className}</span>
                        <span className="text-xs text-gray-500 tabular-nums shrink-0 ml-2">
                          {c.visits} {s.visits.toLowerCase()} · {c.uniqueMembers} {s.members.toLowerCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.coaches.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1 mt-3">{s.coachName}</p>
                  <div className="space-y-1">
                    {data.coaches.map((c) => (
                      <div key={c.coachName} className="flex items-center justify-between text-sm py-1">
                        <span className="text-gray-800 truncate">{c.coachName}</span>
                        <span className="text-xs text-gray-500 tabular-nums shrink-0 ml-2">
                          {c.visits} {s.visits.toLowerCase()} · {c.uniqueMembers} {s.members.toLowerCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* 5. Active members */}
            <section className="rounded-xl bg-white border border-gray-200 p-4 sm:p-5">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#B2E269]" />
                {s.activeTitle}
              </h2>
              <p className="text-3xl font-black mt-2 tabular-nums">{data.active_members.currentActive}</p>
              <p className="text-xs text-gray-500 mt-1">{s.activeSub}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {data.active_members.newThisPeriod} {s.newMembers} · {data.active_members.returningThisPeriod} {s.returningMembers}
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
