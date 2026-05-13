'use client';

/**
 * InsightHistorySection — every AI insight that ever referenced
 * this client, in chronological order.
 *
 * Mounted on /os/clients/[id] below the ChurnRiskPanel. The panel
 * shows the CURRENT score; this section shows the PATTERN over time
 * — "Carlos has been flagged 4 times in the last 30 days" tells a
 * coach to call him directly instead of fire-and-forgetting another
 * WhatsApp message.
 *
 * Surfaces:
 *   - Each insight headline (localized via the templates layer)
 *   - Type label + severity dot
 *   - Status badge: Active / Dismissed / Expired
 *   - If dismissed with feedback, show 👍 or 👎 chip
 *   - Created date
 *
 * Hides itself entirely when there are zero insights — a brand-new
 * member shouldn't get a "no history" empty state cluttering their
 * profile.
 */

import { useEffect, useState } from 'react';
import { Brain, AlertCircle, CheckCircle2, Clock, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { formatShortDate } from '@/lib/format/currency';
import { extractTemplate, renderTemplate } from '@/lib/ai/insight-templates';

interface InsightRow {
  id: string;
  type: 'CHURN_RISK' | 'RETENTION_OPP' | 'REVENUE' | 'GROWTH';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  is_actioned: boolean;
  headline: string;
  body: string;
  data_payload: unknown;
  created_at: string;
  expires_at: string;
}

type State = { kind: 'loading' } | { kind: 'hidden' } | { kind: 'ready'; insights: InsightRow[] };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'AI insight history',
    hint: 'Every time the engine has flagged this member. Pattern beats single signal — if you see them here a lot, a phone call usually beats another message.',
    typeLabel: {
      CHURN_RISK: 'Churn risk',
      RETENTION_OPP: 'Retention',
      REVENUE: 'Revenue',
      GROWTH: 'Growth',
    },
    badgeActive: 'Active',
    badgeDismissed: 'Dismissed',
    badgeExpired: 'Expired',
    feedbackHelpful: 'Marked helpful',
    feedbackFalsePositive: 'Marked false positive',
  },
  es: {
    title: 'Historial de insights',
    hint: 'Cada vez que el motor ha marcado a este miembro. Un patrón vale más que una alerta — si aparece mucho aquí, una llamada suele ganarle a otro mensaje.',
    typeLabel: {
      CHURN_RISK: 'Riesgo de baja',
      RETENTION_OPP: 'Retención',
      REVENUE: 'Ingresos',
      GROWTH: 'Crecimiento',
    },
    badgeActive: 'Activa',
    badgeDismissed: 'Descartada',
    badgeExpired: 'Expirada',
    feedbackHelpful: 'Marcada como útil',
    feedbackFalsePositive: 'Marcada como falsa alarma',
  },
} as const;

const SEVERITY_DOT: Record<InsightRow['severity'], string> = {
  CRITICAL: 'bg-tribe-danger',
  HIGH: 'bg-tribe-warning',
  MEDIUM: 'bg-tribe-info',
  LOW: 'bg-tribe-dark-60',
};

interface FeedbackEnvelope {
  signal?: 'helpful' | 'false_positive';
  at?: string;
}

function readFeedback(payload: unknown): FeedbackEnvelope | null {
  if (!payload || typeof payload !== 'object') return null;
  const fb = (payload as Record<string, unknown>).feedback;
  if (!fb || typeof fb !== 'object') return null;
  return fb as FeedbackEnvelope;
}

function statusOf(row: InsightRow): 'active' | 'dismissed' | 'expired' {
  if (row.is_actioned) return 'dismissed';
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  return 'active';
}

export default function InsightHistorySection({ clientId }: { clientId: string }) {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tribe-os/clients/${clientId}/insights`, { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { insights: InsightRow[] };
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'hidden' });
          return;
        }
        const insights = body.data.insights;
        if (insights.length === 0) {
          setState({ kind: 'hidden' });
          return;
        }
        setState({ kind: 'ready', insights });
      } catch {
        if (!cancelled) setState({ kind: 'hidden' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (state.kind !== 'ready') return null;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Brain className="w-4 h-4 text-tribe-green-dark" />
        <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold">{s.title}</h2>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed mb-3">{s.hint}</p>

      <ul className="space-y-3">
        {state.insights.map((row) => {
          const status = statusOf(row);
          const feedback = readFeedback(row.data_payload);
          // Localize the headline via the templates layer when
          // possible; fall back to the persisted English on older
          // insights generated before the templates landed.
          const template = extractTemplate(row.data_payload, 'headline');
          const displayHeadline = template ? renderTemplate(template, language) || row.headline : row.headline;

          return (
            <li key={row.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
              <span
                className={`w-2 h-2 rounded-full ${SEVERITY_DOT[row.severity]} mt-1.5 shrink-0`}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-[11px] uppercase tracking-[0.06em] font-semibold text-gray-500">
                    {s.typeLabel[row.type]}
                  </span>
                  <StatusBadge status={status} copy={s} />
                  {feedback?.signal === 'helpful' ? (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-tribe-green-dark"
                      title={s.feedbackHelpful}
                    >
                      <ThumbsUp className="w-3 h-3" />
                    </span>
                  ) : feedback?.signal === 'false_positive' ? (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-tribe-danger"
                      title={s.feedbackFalsePositive}
                    >
                      <ThumbsDown className="w-3 h-3" />
                    </span>
                  ) : null}
                </div>
                <p className="text-sm font-semibold text-gray-900">{displayHeadline}</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatShortDate(row.created_at, language)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatusBadge({
  status,
  copy: s,
}: {
  status: 'active' | 'dismissed' | 'expired';
  copy: typeof copy.en | typeof copy.es;
}) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-[0.06em] font-bold px-1.5 py-0.5 rounded-full bg-tribe-warning/15 text-tribe-warning border border-tribe-warning/30">
        <AlertCircle className="w-2.5 h-2.5" />
        {s.badgeActive}
      </span>
    );
  }
  if (status === 'dismissed') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-[0.06em] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
        <CheckCircle2 className="w-2.5 h-2.5" />
        {s.badgeDismissed}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-[0.06em] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
      <Clock className="w-2.5 h-2.5" />
      {s.badgeExpired}
    </span>
  );
}
