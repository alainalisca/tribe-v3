'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, MessageCircle, TrendingUp, ShieldAlert, Sparkles, Skull } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { formatCents, type Currency } from '@/lib/format/currency';
import { trackEvent } from '@/lib/analytics';
import DraftModal from '@/components/tribe-os/DraftModal';
import type { DraftContext } from '@/lib/tribe-os/drafts/templates';

const copy = {
  en: {
    title: 'Forecast',
    subtitle: 'Estimated monthly revenue, money at risk, and recoveries.',
    loading: 'Loading',
    error: 'Could not load forecast.',
    retry: 'Retry',
    monthlyIncome: 'Estimated monthly income',
    atRisk: 'Money at risk',
    atRiskOf: 'of income',
    recovered: 'Recovered this month',
    recoveredPeople: (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`,
    probablyLost: 'Probably lost',
    probablyLostPeople: (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`,
    probablyLostLink: 'Go to Recover',
    riskTableTitle: 'Where is the risk',
    riskTableEmpty: 'No members at risk right now.',
    recoveredTitle: 'Recovered',
    recoveredEmpty: 'No recoveries this month yet.',
    whatsapp: 'WhatsApp',
    unpricedFooter: (n: number) => `${n} member${n > 1 ? 's' : ''} without a price`,
    unpricedLink: 'Set prices',
    badge: 'Came back',
    perMonth: '/mo',
  },
  es: {
    title: 'Pronóstico',
    subtitle: 'Ingreso mensual estimado, dinero en riesgo y recuperaciones.',
    loading: 'Cargando',
    error: 'No se pudo cargar el pronóstico.',
    retry: 'Reintentar',
    monthlyIncome: 'Ingreso mensual estimado',
    atRisk: 'Dinero en riesgo',
    atRiskOf: 'del ingreso',
    recovered: 'Recuperado este mes',
    recoveredPeople: (n: number) => `${n} persona${n > 1 ? 's' : ''}`,
    probablyLost: 'Probablemente perdidos',
    probablyLostPeople: (n: number) => `${n} persona${n > 1 ? 's' : ''}`,
    probablyLostLink: 'Ir a Recuperar',
    riskTableTitle: 'Dónde está el riesgo',
    riskTableEmpty: 'Ningún miembro en riesgo en este momento.',
    recoveredTitle: 'Recuperados',
    recoveredEmpty: 'Sin recuperaciones este mes aún.',
    whatsapp: 'WhatsApp',
    unpricedFooter: (n: number) => `${n} miembro${n > 1 ? 's' : ''} sin precio`,
    unpricedLink: 'Poner precios',
    badge: 'Volvió',
    perMonth: '/mes',
  },
} as const;

interface RiskRow {
  id: string;
  name: string | null;
  phone: string | null;
  plan: string | null;
  monthly_value: number | null;
  reasons: string[];
  risk_level: string | null;
  plan_status: string;
  days_since_last_activity: number | null;
  last_activity_at: string | null;
  last_touch_created_at: string | null;
  plan_ends_on: string | null;
}

interface RecoveredRow {
  id: string;
  name: string | null;
  monthlyValueCents: number | null;
}

interface ForecastData {
  monthly_income: number;
  at_risk_total: number;
  at_risk_count: number;
  at_risk: RiskRow[];
  probably_lost_total: number;
  probably_lost_count: number;
  probably_lost: RiskRow[];
  recovered_count: number;
  recovered_total: number;
  recovered: RecoveredRow[];
  unpriced_count: number;
  currency: string;
}

export default function ForecastPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftCtx, setDraftCtx] = useState<DraftContext | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tribe-os/forecast');
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || s.error);
        return;
      }
      setData(json.data as ForecastData);
      trackEvent('tribe_os_forecast_viewed');
    } catch {
      setError(s.error);
    } finally {
      setLoading(false);
    }
  }, [s.error]);

  useEffect(() => {
    if (gate.state === 'allowed') fetchData();
  }, [gate.state, fetchData]);

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-gray-600 text-sm uppercase tracking-[0.1em]">{s.loading}…</p>
      </main>
    );
  }

  const cur = (data?.currency ?? 'COP') as Currency;
  const pct =
    data && data.monthly_income > 0
      ? Math.round((data.at_risk_total / data.monthly_income) * 100)
      : 0;

  return (
    <main className="text-gray-900 px-4 py-8 sm:py-10 pb-24">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-tribe-green/20 text-tribe-green flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">{s.title}</h1>
            <p className="text-sm text-gray-600 mt-1">{s.subtitle}</p>
          </div>
        </header>

        {loading && <p className="py-12 text-center text-sm text-gray-500">{s.loading}…</p>}

        {error && !loading && (
          <div className="py-12 text-center space-y-4">
            <AlertCircle className="w-8 h-8 text-tribe-red mx-auto" />
            <p className="text-sm text-gray-700">{error}</p>
            <button
              type="button"
              onClick={fetchData}
              className="px-4 py-2 bg-white text-gray-900 text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            >
              {s.retry}
            </button>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-white border border-gray-200 p-4 sm:p-5">
                <p className="text-xs uppercase tracking-[0.08em] text-gray-500 font-semibold">{s.monthlyIncome}</p>
                <p className="text-2xl font-black mt-1 tabular-nums">
                  {formatCents(data.monthly_income, cur, language)}
                </p>
              </div>

              <div className="rounded-xl bg-white border border-red-200 p-4 sm:p-5">
                <p className="text-xs uppercase tracking-[0.08em] text-red-600 font-semibold">{s.atRisk}</p>
                <p className="text-2xl font-black text-red-700 mt-1 tabular-nums">
                  {formatCents(data.at_risk_total, cur, language)}
                </p>
                {pct > 0 && (
                  <p className="text-xs text-red-500 mt-0.5">
                    {pct}% {s.atRiskOf}
                  </p>
                )}
              </div>

              <div className="rounded-xl bg-white border border-tribe-green/30 p-4 sm:p-5">
                <p className="text-xs uppercase tracking-[0.08em] text-tribe-green-dark font-semibold">{s.recovered}</p>
                <p className="text-2xl font-black text-tribe-green-dark mt-1 tabular-nums">
                  {formatCents(data.recovered_total, cur, language)}{s.perMonth}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.recoveredPeople(data.recovered_count)}
                </p>
              </div>
            </div>

            {/* Probably lost banner */}
            {data.probably_lost_count > 0 && (
              <Link
                href="/os/retention"
                className="flex items-center gap-3 py-3 px-4 rounded-xl bg-gray-100 border border-gray-200 hover:border-gray-300 transition-colors group"
              >
                <Skull className="w-5 h-5 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-700">
                    {s.probablyLost}: {formatCents(data.probably_lost_total, cur, language)}{s.perMonth}
                  </p>
                  <p className="text-xs text-gray-500">{s.probablyLostPeople(data.probably_lost_count)}</p>
                </div>
                <span className="text-xs font-semibold text-tribe-green group-hover:underline shrink-0">
                  {s.probablyLostLink} →
                </span>
              </Link>
            )}

            {/* At-risk table */}
            <section>
              <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                {s.riskTableTitle}
              </h2>
              {data.at_risk.length === 0 ? (
                <p className="text-sm text-gray-500 italic py-3">{s.riskTableEmpty}</p>
              ) : (
                <div className="space-y-1.5">
                  {data.at_risk.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center gap-2 py-2 px-3 rounded-lg bg-white border border-gray-100"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-gray-900 block truncate">
                          {row.name ?? '—'}
                        </span>
                        <span className="text-xs text-gray-500 block truncate">
                          {row.plan ?? '—'}
                          {row.monthly_value !== null && (
                            <> · {formatCents(row.monthly_value, cur, language)}{s.perMonth}</>
                          )}
                        </span>
                        <span className="text-[10px] text-red-500 block">
                          {row.reasons.join(' · ')}
                        </span>
                      </div>
                      {row.phone && (
                        <button
                          type="button"
                          onClick={() => {
                            setDraftCtx({
                              memberId: row.id,
                              memberName: row.name,
                              phone: row.phone,
                              reasons: row.reasons,
                              daysSinceLastActivity: row.days_since_last_activity,
                              lastActivityAt: row.last_activity_at,
                              lastTouchCreatedAt: row.last_touch_created_at,
                              planEndsOn: row.plan_ends_on,
                              language,
                            });
                            trackEvent('tribe_os_forecast_whatsapp_clicked');
                          }}
                          className="shrink-0 p-2 rounded-lg bg-tribe-green/10 text-tribe-green hover:bg-tribe-green/20 transition-colors"
                          aria-label={s.whatsapp}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Recovered */}
            <section>
              <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-tribe-green" />
                {s.recoveredTitle}
              </h2>
              {data.recovered.length === 0 ? (
                <p className="text-sm text-gray-500 italic py-3">{s.recoveredEmpty}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.recovered.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-tribe-green/10 text-tribe-green-dark rounded-full"
                    >
                      {r.name ?? '—'}
                      <span className="text-[10px] opacity-70">{s.badge}</span>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Unpriced footer */}
            {data.unpriced_count > 0 && (
              <div className="flex items-center gap-2 py-3 px-4 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-gray-700">
                  {s.unpricedFooter(data.unpriced_count)}.{' '}
                  <Link href="/os/gym#planes" className="text-tribe-green font-semibold hover:underline">
                    {s.unpricedLink} →
                  </Link>
                </span>
              </div>
            )}
          </>
        )}
      </div>

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
    </main>
  );
}
