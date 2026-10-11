'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Mail,
  Users,
  X as XIcon,
} from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { formatCents, type Currency } from '@/lib/format/currency';
import { buildWhatsAppUrl } from '@/lib/phone';
import { ownerReason, humanizeReason } from '@/lib/tribe-os/forecast';
import { trackEvent } from '@/lib/analytics';
import {
  weekLabel,
  previousWeeks,
  formatClassSlot,
  type WeekRange,
  type ClassSlot,
} from '@/lib/tribe-os/weekly/helpers';
import { renderWeeklyEmail, type WeeklyEmailData } from '@/lib/tribe-os/weekly/renderWeeklyEmail';

const copy = {
  en: {
    pageTitle: 'Weekly summary',
    loading: 'Loading',
    redirecting: 'Redirecting',
    error: 'Could not load the weekly summary.',
    retry: 'Retry',
    numbersTitle: 'Weekly numbers',
    visits: 'Visits',
    activeMembers: 'Active members',
    newMembers: 'New',
    touches: 'Contacts made',
    cameBack: 'Came back',
    recovered: 'Recovered',
    atRisk: 'At risk today',
    vsLast: 'vs previous week',
    cameBackTitle: 'Came back thanks to you',
    cameBackEmpty: 'No member came back from a contact this week.',
    days: 'days',
    toContactTitle: 'Contact this week',
    toContactEmpty: 'No members to contact right now.',
    write: 'Write',
    expiringTitle: 'Expiring plans',
    expiringEmpty: 'No plans expiring in the next 7 days.',
    classesTitle: 'Classes this week',
    fullest: 'Fullest',
    emptiest: 'Emptiest',
    noClasses: 'No class data.',
    previewEmail: 'Preview email',
    emailNotReady: 'Automatic sending is not enabled yet.',
    close: 'Close',
  },
  es: {
    pageTitle: 'Resumen semanal',
    loading: 'Cargando',
    redirecting: 'Redirigiendo',
    error: 'No se pudo cargar el resumen semanal.',
    retry: 'Reintentar',
    numbersTitle: 'Números de la semana',
    visits: 'Visitas',
    activeMembers: 'Miembros activos',
    newMembers: 'Nuevos',
    touches: 'Contactos hechos',
    cameBack: 'Volvieron',
    recovered: 'Dinero recuperado',
    atRisk: 'Dinero en riesgo hoy',
    vsLast: 'vs semana anterior',
    cameBackTitle: 'Volvieron gracias a ti',
    cameBackEmpty: 'Ningún miembro volvió por un contacto esta semana.',
    days: 'días',
    toContactTitle: 'Para contactar esta semana',
    toContactEmpty: 'No hay miembros para contactar ahora mismo.',
    write: 'Escribir',
    expiringTitle: 'Planes por vencer',
    expiringEmpty: 'No hay planes por vencer en los próximos 7 días.',
    classesTitle: 'Clases de la semana',
    fullest: 'Más llena',
    emptiest: 'Más vacía',
    noClasses: 'Sin datos de clases.',
    previewEmail: 'Vista previa del correo',
    emailNotReady: 'El envío automático aún no está activado.',
    close: 'Cerrar',
  },
} as const;

const CHANNEL_LABELS: Record<string, { en: string; es: string }> = {
  whatsapp: { en: 'WhatsApp', es: 'WhatsApp' },
  call: { en: 'Call', es: 'Llamada' },
  in_person: { en: 'In person', es: 'En persona' },
  other: { en: 'Other', es: 'Otro' },
};

interface WeeklyData {
  week: WeekRange;
  currency: string;
  numbers: {
    visits: number;
    visits_prev: number;
    visits_pct: number | null;
    active_members: number;
    active_members_prev: number;
    new_members: number;
    new_members_prev: number;
    touches: number;
    touches_prev: number;
    came_back: number;
    recovered_cents: number;
    at_risk_cents: number;
  };
  came_back_members: {
    id: string;
    name: string | null;
    channel: string;
    days: number;
    monthlyValueCents: number | null;
  }[];
  to_contact: {
    id: string;
    name: string | null;
    phone: string | null;
    plan: string | null;
    monthlyValueCents: number | null;
    reasons: string[];
    daysSinceLastActivity: number | null;
  }[];
  expiring_plans: {
    id: string;
    name: string | null;
    plan: string | null;
    planEndsOn: string;
    expiryLabel: string;
    expiryLabelEn: string;
    monthlyValueCents: number | null;
  }[];
  classes: {
    fullest: ClassSlot | null;
    emptiest: ClassSlot | null;
  };
}

export default function WeeklyPage() {
  const { language } = useLanguage();
  const gate = useTribeOSPremiumGate();
  const s = copy[language];

  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [emailOpen, setEmailOpen] = useState(false);

  const weeks = previousWeeks(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }), 8);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/tribe-os/weekly?week=${weekOffset}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [weekOffset]);

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    trackEvent('tribe_os_weekly_viewed');
    fetchData();
  }, [gate.state, fetchData]);

  if (gate.state === 'redirecting') {
    return <p className="p-8 text-sm text-gray-500">{s.redirecting}</p>;
  }

  const cur = (data?.currency ?? 'COP') as Currency;
  const n = data?.numbers;

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{s.pageTitle}</h1>
          {data && (
            <p className="text-sm text-gray-500">{weekLabel(data.week, language)}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekOffset((o) => Math.min(7, o + 1))}
            disabled={weekOffset >= 7}
            className="p-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <select
            value={weekOffset}
            onChange={(e) => setWeekOffset(Number(e.target.value))}
            className="text-xs bg-gray-100 rounded-lg px-2 py-1.5 border-0 text-gray-700"
          >
            {weeks.map((w, i) => (
              <option key={w.monday} value={i}>
                {weekLabel(w, language)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
            disabled={weekOffset <= 0}
            className="p-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading && !data && (
        <p className="p-8 text-sm text-gray-500 text-center">{s.loading}...</p>
      )}

      {error && (
        <div className="p-8 text-center">
          <p className="text-sm text-gray-500 mb-2">{s.error}</p>
          <button type="button" onClick={fetchData} className="text-sm text-tribe-green hover:underline">
            {s.retry}
          </button>
        </div>
      )}

      {data && n && (
        <>
          {/* Numbers */}
          <section className="rounded-xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
              <BarChart3 className="w-4 h-4 text-[#B2E269]" />
              {s.numbersTitle}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox
                label={s.visits}
                value={String(n.visits)}
                sub={n.visits_pct !== null ? `${n.visits_pct > 0 ? '+' : ''}${n.visits_pct}% ${s.vsLast}` : undefined}
              />
              <StatBox label={s.activeMembers} value={String(n.active_members)} />
              <StatBox label={s.newMembers} value={String(n.new_members)} />
              <StatBox label={s.touches} value={String(n.touches)} />
              <StatBox label={s.cameBack} value={String(n.came_back)} />
              <StatBox label={s.recovered} value={formatCents(n.recovered_cents, cur, language)} />
              <StatBox label={s.atRisk} value={formatCents(n.at_risk_cents, cur, language)} highlight />
            </div>
          </section>

          {/* Came back */}
          <section className="rounded-xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
              <Heart className="w-4 h-4 text-[#B2E269]" />
              {s.cameBackTitle}
            </h2>
            {data.came_back_members.length === 0 ? (
              <p className="text-sm text-gray-500 italic">{s.cameBackEmpty}</p>
            ) : (
              <ul className="space-y-2">
                {data.came_back_members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-900">{m.name ?? 'Sin nombre'}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        {CHANNEL_LABELS[m.channel]?.[language] ?? m.channel}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        {m.days} {s.days}
                      </span>
                    </div>
                    {m.monthlyValueCents !== null && m.monthlyValueCents > 0 && (
                      <span className="text-xs text-gray-500">{formatCents(m.monthlyValueCents, cur, language)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* To contact */}
          <section className="rounded-xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
              <MessageCircle className="w-4 h-4 text-[#B2E269]" />
              {s.toContactTitle}
            </h2>
            {data.to_contact.length === 0 ? (
              <p className="text-sm text-gray-500 italic">{s.toContactEmpty}</p>
            ) : (
              <ul className="space-y-3">
                {data.to_contact.map((m) => {
                  const reason = m.reasons.length > 0
                    ? humanizeReason(ownerReason(m.reasons[0], language), null, language)
                    : '';
                  const waUrl = buildWhatsAppUrl(m.phone);
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{m.name ?? 'Sin nombre'}</p>
                        {reason && <p className="text-xs text-gray-500 truncate">{reason}</p>}
                        {m.plan && (
                          <p className="text-xs text-gray-400 truncate">{m.plan}</p>
                        )}
                      </div>
                      {waUrl && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-tribe-green text-white hover:bg-tribe-green/90 transition-colors"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          {s.write}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Expiring plans */}
          <section className="rounded-xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
              <Users className="w-4 h-4 text-[#B2E269]" />
              {s.expiringTitle}
            </h2>
            {data.expiring_plans.length === 0 ? (
              <p className="text-sm text-gray-500 italic">{s.expiringEmpty}</p>
            ) : (
              <ul className="space-y-2">
                {data.expiring_plans.map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-900">{m.name ?? ''}</span>
                      <span className="text-xs text-gray-500 ml-2">{m.plan}</span>
                    </div>
                    <span className="text-xs text-gray-500 capitalize">
                      {language === 'es' ? m.expiryLabel : m.expiryLabelEn}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Classes */}
          <section className="rounded-xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
              <BarChart3 className="w-4 h-4 text-[#B2E269]" />
              {s.classesTitle}
            </h2>
            {data.classes.fullest ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{s.fullest}</span>
                  <span className="font-medium text-gray-900">
                    {formatClassSlot(data.classes.fullest, language)}
                  </span>
                </div>
                {data.classes.emptiest && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">{s.emptiest}</span>
                    <span className="font-medium text-gray-900">
                      {formatClassSlot(data.classes.emptiest, language)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">{s.noClasses}</p>
            )}
          </section>

          {/* Email preview button */}
          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => setEmailOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <Mail className="h-4 w-4" />
              {s.previewEmail}
            </button>
          </div>

          {/* Email modal */}
          {emailOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white rounded-2xl shadow-xl max-w-[640px] w-full max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                  <h3 className="text-sm font-bold text-gray-900">{s.previewEmail}</h3>
                  <button
                    type="button"
                    onClick={() => setEmailOpen(false)}
                    className="p-1 rounded-lg hover:bg-gray-100"
                  >
                    <XIcon className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto">
                  <iframe
                    srcDoc={renderWeeklyEmail(
                      {
                        ...data,
                        came_back_members: data.came_back_members.map((m) => ({
                          ...m,
                          monthlyValueCents: m.monthlyValueCents,
                        })),
                      } as WeeklyEmailData,
                      language,
                    )}
                    className="w-full h-full min-h-[500px] border-0"
                    title="Email preview"
                  />
                </div>
                <div className="p-3 border-t border-gray-200 text-center">
                  <p className="text-xs text-gray-400">{s.emailNotReady}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <p className={`text-2xl font-bold ${highlight ? 'text-red-500' : 'text-gray-900'}`}>{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
