'use client';

/**
 * /os/intelligence — Tribe.OS intelligence feed.
 *
 * Renders the AI-generated insight cards for the caller's gym,
 * ordered CRITICAL → HIGH → MEDIUM → LOW. Each card has:
 *   - severity-colored left rail
 *   - type badge (Churn Risk / Retention / Revenue / Growth)
 *   - headline + body
 *   - confidence-score tag and predicted-revenue impact when set
 *   - action button (label varies by action_type)
 *   - dismiss button
 *
 * Data source: GET /api/tribe-os/intelligence.
 *
 * Empty state covers two cases:
 *   - The gym is new and the nightly batch hasn't generated anything
 *   - Every active insight has been dismissed (good outcome — clean
 *     queue)
 * The copy distinguishes both.
 *
 * The nightly batch that writes these rows lives in Phase D's
 * follow-up commit; until then this page renders the empty state.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Brain,
  ChevronRight,
  CircleDollarSign,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
  X as XIcon,
} from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { formatCents } from '@/lib/format/currency';
import { Avatar, Badge, Button, Card, CardContent } from '@/components/tribe-os/ui';
import type { CommunityInsight, InsightActionType, InsightSeverity, InsightType } from '@/lib/dal/communityInsights';

type WidgetState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; insights: CommunityInsight[] };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    redirectingLabel: 'Redirecting',
    loadingLabel: 'Loading',
    pageTitle: 'Intelligence',
    pageSubtitle: 'AI-generated insights about your gym — refreshed nightly.',
    errorTitle: 'Could not load insights.',
    retry: 'Retry',
    emptyTitleNew: 'No insights yet',
    emptyHintNew:
      'The nightly intelligence engine writes alerts here when it spots churn risk, retention opportunities, revenue gaps, or growth signals. Check back tomorrow.',
    emptyTitleClean: 'All clear',
    emptyHintClean: 'Every active alert has been actioned. Nice work.',
    severity: {
      CRITICAL: 'Critical',
      HIGH: 'High',
      MEDIUM: 'Medium',
      LOW: 'Low',
    },
    type: {
      CHURN_RISK: 'Churn Risk',
      RETENTION_OPP: 'Retention',
      REVENUE: 'Revenue',
      GROWTH: 'Growth',
    },
    action: {
      SEND_MESSAGE: 'Send message',
      CREATE_SESSION: 'Create session',
      CALL_MEMBER: 'Call member',
      REVIEW_SCHEDULE: 'Review schedule',
    },
    membersAffected: (n: number) => (n === 1 ? '1 member affected' : `${n} members affected`),
    estImpact: 'Est. impact',
    confidence: (pct: number) => `${pct}% confidence`,
    dismiss: 'Dismiss',
    dismissAria: 'Dismiss insight',
    viewActive: 'Active',
    viewHistory: 'History',
    emptyTitleHistory: 'No past alerts',
    emptyHintHistory: 'Dismissed and expired alerts will appear here so you can look back at what the engine flagged.',
    runEngine: 'Run intelligence engine',
    runningEngine: 'Running',
    runEngineError: 'Could not run the engine. Try again in a moment.',
    runEngineSummary: (n: number, atRisk: number, created: number) =>
      `Scored ${n} ${n === 1 ? 'member' : 'members'} · ${atRisk} at risk · ${created} new ${created === 1 ? 'alert' : 'alerts'}`,
  },
  es: {
    redirectingLabel: 'Redirigiendo',
    loadingLabel: 'Cargando',
    pageTitle: 'Inteligencia',
    pageSubtitle: 'Insights generados por IA sobre tu gym — se actualizan cada noche.',
    errorTitle: 'No se pudieron cargar los insights.',
    retry: 'Reintentar',
    emptyTitleNew: 'Aún sin insights',
    emptyHintNew:
      'El motor nocturno escribe alertas aquí cuando detecta riesgo de baja, oportunidades de retención, brechas de ingresos o señales de crecimiento. Vuelve mañana.',
    emptyTitleClean: 'Todo en orden',
    emptyHintClean: 'Cada alerta activa fue atendida. Buen trabajo.',
    severity: {
      CRITICAL: 'Crítico',
      HIGH: 'Alto',
      MEDIUM: 'Medio',
      LOW: 'Bajo',
    },
    type: {
      CHURN_RISK: 'Riesgo de baja',
      RETENTION_OPP: 'Retención',
      REVENUE: 'Ingresos',
      GROWTH: 'Crecimiento',
    },
    action: {
      SEND_MESSAGE: 'Enviar mensaje',
      CREATE_SESSION: 'Crear sesión',
      CALL_MEMBER: 'Llamar al miembro',
      REVIEW_SCHEDULE: 'Revisar horario',
    },
    membersAffected: (n: number) => (n === 1 ? '1 miembro afectado' : `${n} miembros afectados`),
    estImpact: 'Impacto estimado',
    confidence: (pct: number) => `${pct}% de confianza`,
    dismiss: 'Descartar',
    dismissAria: 'Descartar insight',
    viewActive: 'Activas',
    viewHistory: 'Historial',
    emptyTitleHistory: 'Sin alertas pasadas',
    emptyHintHistory:
      'Las alertas descartadas y expiradas aparecerán aquí para que puedas revisar lo que el motor detectó.',
    runEngine: 'Ejecutar motor de inteligencia',
    runningEngine: 'Ejecutando',
    runEngineError: 'No se pudo ejecutar el motor. Intenta en un momento.',
    runEngineSummary: (n: number, atRisk: number, created: number) =>
      `${n} ${n === 1 ? 'miembro evaluado' : 'miembros evaluados'} · ${atRisk} en riesgo · ${created} ${created === 1 ? 'alerta nueva' : 'alertas nuevas'}`,
  },
} as const;

const SEVERITY_RAIL: Record<InsightSeverity, string> = {
  CRITICAL: 'bg-tribe-danger',
  HIGH: 'bg-tribe-warning',
  MEDIUM: 'bg-tribe-info',
  LOW: 'bg-tribe-dark-60',
};

const SEVERITY_BADGE: Record<InsightSeverity, 'danger' | 'warning' | 'info' | 'default'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'default',
};

const TYPE_ICON: Record<InsightType, typeof AlertTriangle> = {
  CHURN_RISK: AlertTriangle,
  RETENTION_OPP: Users,
  REVENUE: CircleDollarSign,
  GROWTH: TrendingUp,
};

export default function IntelligencePage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [state, setState] = useState<WidgetState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  // View mode — 'active' shows unactioned non-expired alerts (the
  // default), 'history' adds dismissed + expired so the user can
  // look back at what the engine flagged before.
  const [view, setView] = useState<'active' | 'history'>('active');
  // Bulk-rescore state: controls the "Run intelligence engine"
  // button + the small summary line under it after a run completes.
  const [rescoring, setRescoring] = useState(false);
  const [rescoreSummary, setRescoreSummary] = useState<string | null>(null);
  const [rescoreError, setRescoreError] = useState<string | null>(null);

  async function handleRescoreAll() {
    if (rescoring) return;
    setRescoring(true);
    setRescoreError(null);
    setRescoreSummary(null);
    try {
      const res = await fetch('/api/tribe-os/ai/rescore-all/', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: {
          scored: number;
          at_risk_count: number;
          insights_created: number;
        };
        error?: { code: string; message: string };
      };
      if (!res.ok || !body.success || !body.data) {
        setRescoreError(s.runEngineError);
        setRescoring(false);
        return;
      }
      const { scored, at_risk_count, insights_created } = body.data;
      setRescoreSummary(s.runEngineSummary(scored, at_risk_count, insights_created));
      trackEvent('tribe_os_rescore_all_run', {
        scored,
        at_risk_count,
        insights_created,
      });
      // Bump the reload key so the insight list refetches with the
      // freshly created CHURN_RISK cards.
      setReloadKey((k) => k + 1);
    } catch {
      setRescoreError(s.runEngineError);
    } finally {
      setRescoring(false);
    }
  }

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const url = new URL('/api/tribe-os/intelligence/', window.location.origin);
        if (view === 'history') {
          url.searchParams.set('include_actioned', 'true');
          url.searchParams.set('include_expired', 'true');
        }
        const res = await fetch(url.toString(), { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { insights: CommunityInsight[] };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error', message: body.error || s.errorTitle });
          return;
        }
        setState({ kind: 'ready', insights: body.data.insights });
        trackEvent('tribe_os_intelligence_viewed', { insight_count: body.data.insights.length, view });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: s.errorTitle });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gate.state, reloadKey, view, s.errorTitle]);

  // Group by severity for the section headers.
  const grouped = useMemo(() => {
    if (state.kind !== 'ready') return null;
    const buckets: Record<InsightSeverity, CommunityInsight[]> = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: [],
    };
    for (const i of state.insights) buckets[i.severity].push(i);
    return buckets;
  }, [state]);

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-tribe-dark-80 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : s.loadingLabel}…
        </p>
      </main>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-tribe bg-tribe-green-50 flex items-center justify-center shrink-0">
              <Brain className="w-5 h-5 text-tribe-green-dark" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-tribe-dark">{s.pageTitle}</h1>
              <p className="text-sm text-tribe-dark-80 mt-1">{s.pageSubtitle}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {/* Active / History view toggle. Lives in the header so
                  it's available even when the body is in loading or
                  empty state. */}
              <div className="inline-flex items-center bg-white border border-tribe-dark-40 rounded-tribe p-0.5">
                <button
                  type="button"
                  onClick={() => setView('active')}
                  className={`px-3 py-1 text-xs font-semibold rounded-tribe transition-colors ${
                    view === 'active' ? 'bg-tribe-green text-tribe-dark' : 'text-tribe-dark-80 hover:text-tribe-dark'
                  }`}
                >
                  {s.viewActive}
                </button>
                <button
                  type="button"
                  onClick={() => setView('history')}
                  className={`px-3 py-1 text-xs font-semibold rounded-tribe transition-colors ${
                    view === 'history' ? 'bg-tribe-green text-tribe-dark' : 'text-tribe-dark-80 hover:text-tribe-dark'
                  }`}
                >
                  {s.viewHistory}
                </button>
              </div>
              <Button onClick={handleRescoreAll} loading={rescoring} variant="primary" size="sm">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                {rescoring ? s.runningEngine : s.runEngine}
              </Button>
            </div>
            {rescoreError ? <span className="text-xs text-tribe-danger">{rescoreError}</span> : null}
            {rescoreSummary ? <span className="text-xs text-tribe-dark-80">{rescoreSummary}</span> : null}
          </div>
        </header>

        {state.kind === 'loading' ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 bg-white rounded-tribe shadow-tribe animate-pulse" />
            ))}
          </div>
        ) : state.kind === 'error' ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-tribe-danger mx-auto" />
              <p className="text-sm text-tribe-dark">{state.message}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="px-4 py-2 bg-tribe-dark-40 text-tribe-dark text-sm font-semibold rounded-tribe hover:bg-tribe-dark-60"
              >
                {s.retry}
              </button>
            </CardContent>
          </Card>
        ) : state.insights.length === 0 ? (
          <EmptyState copy={s} view={view} />
        ) : (
          <div className="space-y-6">
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => {
              const items = grouped?.[sev] ?? [];
              if (items.length === 0) return null;
              return (
                <section key={sev} className="space-y-2">
                  <h2 className="text-xs uppercase tracking-[0.1em] font-bold text-tribe-dark-80 px-1">
                    {s.severity[sev]}
                  </h2>
                  <div className="space-y-3">
                    {items.map((i) => (
                      <InsightCard
                        key={i.id}
                        insight={i}
                        copy={s}
                        onDismissed={() => setReloadKey((k) => k + 1)}
                        language={language}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ copy: s, view }: { copy: typeof copy.en | typeof copy.es; view: 'active' | 'history' }) {
  const title = view === 'history' ? s.emptyTitleHistory : s.emptyTitleNew;
  const hint = view === 'history' ? s.emptyHintHistory : s.emptyHintNew;
  return (
    <Card>
      <CardContent className="py-16 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-tribe bg-tribe-green-50 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-tribe-green-dark" />
        </div>
        <h2 className="text-lg font-semibold text-tribe-dark">{title}</h2>
        <p className="text-sm text-tribe-dark-80 max-w-md mx-auto leading-relaxed">{hint}</p>
      </CardContent>
    </Card>
  );
}

function InsightCard({
  insight,
  copy: s,
  onDismissed,
  language,
}: {
  insight: CommunityInsight;
  copy: typeof copy.en | typeof copy.es;
  onDismissed: () => void;
  language: 'en' | 'es';
}) {
  const [dismissing, setDismissing] = useState(false);
  const TypeIcon = TYPE_ICON[insight.type];

  // Action button destination — derived from action_type. Each
  // type points at the surface where the action makes sense.
  const actionHref = useMemo(() => {
    if (!insight.action_type) return null;
    switch (insight.action_type) {
      case 'SEND_MESSAGE':
        return insight.member_ids.length === 1 ? `/os/clients/${insight.member_ids[0]}` : '/os/members';
      case 'CREATE_SESSION':
        return '/create';
      case 'CALL_MEMBER':
        return insight.member_ids.length === 1 ? `/os/clients/${insight.member_ids[0]}` : '/os/members';
      case 'REVIEW_SCHEDULE':
        return '/os/schedule';
      default:
        return null;
    }
  }, [insight.action_type, insight.member_ids]);

  const actionLabel =
    insight.action_label || (insight.action_type ? s.action[insight.action_type as InsightActionType] : null);

  async function handleDismiss() {
    if (dismissing) return;
    setDismissing(true);
    try {
      const res = await fetch(`/api/tribe-os/intelligence/${insight.id}/dismiss/`, { method: 'POST' });
      if (res.ok) {
        trackEvent('tribe_os_insight_dismissed', {
          type: insight.type,
          severity: insight.severity,
        });
        onDismissed();
      }
    } finally {
      setDismissing(false);
    }
  }

  const confidencePct = insight.confidence_score != null ? Math.round(insight.confidence_score * 100) : null;
  const impactCents = insight.predicted_revenue_cents;

  return (
    <article className="bg-white rounded-tribe shadow-tribe overflow-hidden">
      <div className="flex">
        {/* Severity rail */}
        <div className={`w-1 shrink-0 ${SEVERITY_RAIL[insight.severity]}`} aria-hidden="true" />
        <div className="flex-1 p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-8 h-8 rounded-tribe bg-tribe-dark-40 flex items-center justify-center shrink-0">
                <TypeIcon className="w-4 h-4 text-tribe-dark" />
              </div>
              <Badge variant={SEVERITY_BADGE[insight.severity]}>{s.type[insight.type]}</Badge>
              {confidencePct != null ? (
                <span className="text-xs text-tribe-dark-80">{s.confidence(confidencePct)}</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={dismissing}
              aria-label={s.dismissAria}
              className="p-1 -m-1 text-tribe-dark-80 hover:text-tribe-dark hover:bg-tribe-dark-40 rounded-tribe transition-colors disabled:opacity-50"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          <h3 className="text-base font-semibold text-tribe-dark mb-1">{insight.headline}</h3>
          <p className="text-sm text-tribe-dark-80 leading-relaxed mb-3">{insight.body}</p>

          <div className="flex items-center gap-4 flex-wrap text-xs text-tribe-dark-80 mb-3">
            {insight.member_ids.length > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {s.membersAffected(insight.member_ids.length)}
              </span>
            ) : null}
            {impactCents != null && impactCents > 0 ? (
              <span className="inline-flex items-center gap-1 text-tribe-green-dark font-semibold">
                <CircleDollarSign className="w-3.5 h-3.5" />
                {s.estImpact}: {formatCents(impactCents, 'USD', language)}
              </span>
            ) : null}
          </div>

          {/* Avatar preview when members are tied to the insight */}
          {insight.member_ids.length > 0 ? (
            <div className="flex items-center -space-x-2 mb-4">
              {insight.member_ids.slice(0, 5).map((id) => (
                <Avatar key={id} initials="·" size="sm" className="border-2 border-white" />
              ))}
              {insight.member_ids.length > 5 ? (
                <span className="h-8 w-8 rounded-full bg-tribe-dark-40 flex items-center justify-center border-2 border-white text-xs font-semibold text-tribe-dark-80">
                  +{insight.member_ids.length - 5}
                </span>
              ) : null}
            </div>
          ) : null}

          {actionHref && actionLabel ? (
            <Link
              href={actionHref}
              onClick={() =>
                trackEvent('tribe_os_insight_action_clicked', {
                  type: insight.type,
                  action_type: insight.action_type,
                })
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-tribe-green text-tribe-dark text-sm font-semibold rounded-tribe hover:bg-tribe-green-dark transition-colors"
            >
              {actionLabel}
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
