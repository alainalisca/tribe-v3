'use client';

/**
 * ChurnRiskPanel — member-detail intelligence card.
 *
 * Renders the AI-computed churn-risk score and health status for a
 * single member, plus a "Rescore now" button that calls
 * POST /api/tribe-os/ai/rescore-member to recompute on demand.
 *
 * Layout:
 *   ┌────────────────────────────────────────┐
 *   │ Churn Risk        [HEALTHY/WATCH/AT_R] │
 *   │                                        │
 *   │    [ 0.42 ]   "Watch"                  │
 *   │                                        │
 *   │ Last scored 3 hours ago                │
 *   │                                        │
 *   │ Signal breakdown (collapsible):        │
 *   │   Days since last visit    0.18        │
 *   │   Community isolation      0.15        │
 *   │   ...                                  │
 *   │                                        │
 *   │ [ Rescore now ]                        │
 *   └────────────────────────────────────────┘
 *
 * Three states:
 *   1. Member never scored (churn_risk_score is null) — shows a
 *      "Not scored yet" placeholder with the Rescore button.
 *   2. Member has a score but no breakdown shown — clicking the
 *      arrow reveals the per-signal contributions.
 *   3. Member was just rescored — fresh breakdown is in component
 *      state, so we render that instead of the persisted top-line.
 */

import { useState } from 'react';
import { Brain, RefreshCw, ShieldAlert, ShieldCheck, ShieldQuestion, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/tribe-os/ui';
import { trackEvent } from '@/lib/analytics';
import type { HealthStatus, ScoreOutput } from '@/lib/ai/types';

interface ChurnRiskPanelProps {
  clientId: string;
  initialScore: number | null;
  initialHealthStatus: HealthStatus;
  initialUpdatedAt: string | null;
}

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Churn Risk',
    notScoredTitle: 'Not scored yet',
    notScoredHint: 'Run a rescore to compute this member’s churn risk from their recent activity.',
    lastScoredJustNow: 'Just scored',
    lastScoredMinutesAgo: (n: number) => (n === 1 ? '1 minute ago' : `${n} minutes ago`),
    lastScoredHoursAgo: (n: number) => (n === 1 ? '1 hour ago' : `${n} hours ago`),
    lastScoredDaysAgo: (n: number) => (n === 1 ? '1 day ago' : `${n} days ago`),
    healthLabel: {
      HEALTHY: 'Healthy',
      WATCH: 'Watch',
      AT_RISK: 'At Risk',
    },
    rescore: 'Rescore now',
    rescoring: 'Rescoring',
    rescoreError: 'Could not rescore. Try again in a moment.',
    showBreakdown: 'Signal breakdown',
    hideBreakdown: 'Hide breakdown',
    signalLabels: {
      daysSinceLastAttendance: 'Days since last visit',
      attendanceFrequencyDelta: 'Attendance decline',
      streakBroken: 'Streak break',
      communityGraphIsolation: 'Community isolation',
      paymentFailures: 'Payment failures',
      cancellationRate: 'Cancellation rate',
      communityEngagementDrop: 'Engagement drop',
    },
  },
  es: {
    title: 'Riesgo de baja',
    notScoredTitle: 'Aún sin puntuación',
    notScoredHint: 'Ejecuta un nuevo cálculo para estimar el riesgo a partir de la actividad reciente.',
    lastScoredJustNow: 'Recién calculado',
    lastScoredMinutesAgo: (n: number) => (n === 1 ? 'hace 1 minuto' : `hace ${n} minutos`),
    lastScoredHoursAgo: (n: number) => (n === 1 ? 'hace 1 hora' : `hace ${n} horas`),
    lastScoredDaysAgo: (n: number) => (n === 1 ? 'hace 1 día' : `hace ${n} días`),
    healthLabel: {
      HEALTHY: 'Saludable',
      WATCH: 'En seguimiento',
      AT_RISK: 'En riesgo',
    },
    rescore: 'Recalcular',
    rescoring: 'Recalculando',
    rescoreError: 'No se pudo recalcular. Intenta en un momento.',
    showBreakdown: 'Detalle por señal',
    hideBreakdown: 'Ocultar detalle',
    signalLabels: {
      daysSinceLastAttendance: 'Días sin asistir',
      attendanceFrequencyDelta: 'Baja de frecuencia',
      streakBroken: 'Racha rota',
      communityGraphIsolation: 'Aislamiento social',
      paymentFailures: 'Pagos fallidos',
      cancellationRate: 'Cancelaciones',
      communityEngagementDrop: 'Bajón de actividad',
    },
  },
} as const;

const HEALTH_ICON: Record<HealthStatus, typeof ShieldCheck> = {
  HEALTHY: ShieldCheck,
  WATCH: ShieldQuestion,
  AT_RISK: ShieldAlert,
};

const HEALTH_BADGE: Record<HealthStatus, 'success' | 'warning' | 'danger'> = {
  HEALTHY: 'success',
  WATCH: 'warning',
  AT_RISK: 'danger',
};

const SCORE_TEXT_COLOR: Record<HealthStatus, string> = {
  HEALTHY: 'text-tribe-green-dark',
  WATCH: 'text-tribe-warning',
  AT_RISK: 'text-tribe-danger',
};

/**
 * Relative-time formatter for the "Last scored …" line.
 * Returns "Just scored" when within 60 seconds, then "X minutes ago",
 * "X hours ago", "X days ago".
 */
function formatRelative(iso: string, s: typeof copy.en | typeof copy.es): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return s.lastScoredJustNow;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return s.lastScoredJustNow;
  if (diffMin < 60) return s.lastScoredMinutesAgo(diffMin);
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return s.lastScoredHoursAgo(diffHr);
  const diffDay = Math.floor(diffHr / 24);
  return s.lastScoredDaysAgo(diffDay);
}

export default function ChurnRiskPanel({
  clientId,
  initialScore,
  initialHealthStatus,
  initialUpdatedAt,
}: ChurnRiskPanelProps) {
  const { language } = useLanguage();
  const s = copy[language];

  // Local state takes over after a fresh rescore so the user sees
  // the updated score immediately without waiting for the parent
  // to refetch. The persisted columns get updated server-side; the
  // page will pick them up on next reload.
  const [score, setScore] = useState<number | null>(initialScore);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>(initialHealthStatus);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [breakdown, setBreakdown] = useState<Record<string, number> | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRescore() {
    if (rescoring) return;
    setRescoring(true);
    setError(null);
    try {
      const res = await fetch('/api/tribe-os/ai/rescore-member/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: ScoreOutput;
        error?: { code: string; message: string };
      };
      if (!res.ok || !body.success || !body.data) {
        setError(s.rescoreError);
        setRescoring(false);
        return;
      }
      setScore(body.data.churnRiskScore);
      setHealthStatus(body.data.healthStatus);
      setUpdatedAt(new Date().toISOString());
      setBreakdown(body.data.signalBreakdown);
      // Auto-open the breakdown after a fresh rescore so the user
      // sees what changed.
      setShowBreakdown(true);
      trackEvent('tribe_os_member_rescored', {
        score: body.data.churnRiskScore,
        health_status: body.data.healthStatus,
      });
    } catch {
      setError(s.rescoreError);
    } finally {
      setRescoring(false);
    }
  }

  const HealthIcon = HEALTH_ICON[healthStatus];
  const hasScore = score != null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="w-4 h-4 text-tribe-green-dark" />
            {s.title}
          </CardTitle>
          {hasScore ? <Badge variant={HEALTH_BADGE[healthStatus]}>{s.healthLabel[healthStatus]}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent>
        {!hasScore ? (
          // ── No score yet ───────────────────────────────────────
          <div className="text-center py-6 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-tribe bg-tribe-dark-40 flex items-center justify-center">
              <Brain className="w-6 h-6 text-tribe-dark-80" />
            </div>
            <p className="text-sm font-semibold text-tribe-dark">{s.notScoredTitle}</p>
            <p className="text-xs text-tribe-dark-80 max-w-xs mx-auto">{s.notScoredHint}</p>
            <Button onClick={handleRescore} loading={rescoring} size="sm">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              {rescoring ? s.rescoring : s.rescore}
            </Button>
          </div>
        ) : (
          // ── Scored ─────────────────────────────────────────────
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className={`text-5xl font-black tabular-nums leading-none ${SCORE_TEXT_COLOR[healthStatus]}`}>
                {score.toFixed(2)}
              </div>
              <div>
                <p className={`text-sm font-semibold ${SCORE_TEXT_COLOR[healthStatus]}`}>
                  {s.healthLabel[healthStatus]}
                </p>
                {updatedAt ? <p className="text-xs text-tribe-dark-80">{formatRelative(updatedAt, s)}</p> : null}
              </div>
              <HealthIcon className={`w-6 h-6 ml-auto ${SCORE_TEXT_COLOR[healthStatus]}`} />
            </div>

            {breakdown ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowBreakdown((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-tribe-dark-80 hover:text-tribe-dark transition-colors"
                >
                  {showBreakdown ? s.hideBreakdown : s.showBreakdown}
                  {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showBreakdown ? <SignalBreakdown breakdown={breakdown} copy={s} /> : null}
              </div>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
              <Button onClick={handleRescore} loading={rescoring} variant="secondary" size="sm">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                {rescoring ? s.rescoring : s.rescore}
              </Button>
              {error ? <span className="text-xs text-tribe-danger">{error}</span> : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Per-signal bar chart. Each row shows the signal label + a 0-1
 * bar tinted by contribution magnitude. Helps a coach see why a
 * member scored where they did.
 */
function SignalBreakdown({
  breakdown,
  copy: s,
}: {
  breakdown: Record<string, number>;
  copy: typeof copy.en | typeof copy.es;
}) {
  const max = Math.max(...Object.values(breakdown), 0.001);
  return (
    <div className="space-y-1.5">
      {Object.entries(breakdown).map(([signal, value]) => {
        const label = (s.signalLabels as Record<string, string>)[signal] ?? signal;
        const pct = Math.round((value / max) * 100);
        const intensity = value >= 0.15 ? 'bg-tribe-danger' : value >= 0.08 ? 'bg-tribe-warning' : 'bg-tribe-dark-60';
        return (
          <div key={signal} className="flex items-center gap-2 text-xs">
            <span className="text-tribe-dark-80 w-32 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 bg-tribe-dark-40 rounded-full overflow-hidden">
              <div className={`h-full ${intensity}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="tabular-nums text-tribe-dark font-semibold w-10 text-right">{value.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}
