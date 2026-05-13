'use client';

/**
 * InsightsBanner — compact nudge on /os/dashboard.
 *
 * One-row banner that surfaces the count of active community_insights
 * for the gym + a severity breakdown, and links to /os/intelligence
 * for the full feed. Hides itself when there are zero active alerts
 * (no point showing 'all clear' noise on the dashboard — the at-risk
 * widget already covers the empty-state messaging).
 *
 * Sits just above the KPI strip so a coach lands on the dashboard
 * and immediately sees 'there are 3 alerts waiting' before scanning
 * stats or sessions.
 *
 * Mounts above the heavy widgets so failure (env missing,
 * intelligence endpoint 500) silently hides — we never let the
 * banner block the rest of the page.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Brain, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import type { CommunityInsight, InsightSeverity } from '@/lib/dal/communityInsights';

type BannerState =
  | { kind: 'loading' }
  | { kind: 'hidden' }
  | { kind: 'ready'; total: number; bySeverity: Record<InsightSeverity, number> };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: (n: number) => (n === 1 ? '1 alert needs your attention' : `${n} alerts need your attention`),
    breakdown: {
      CRITICAL: (n: number) => `${n} critical`,
      HIGH: (n: number) => `${n} high`,
      MEDIUM: (n: number) => `${n} medium`,
      LOW: (n: number) => `${n} low`,
    },
    cta: 'Open Intelligence',
  },
  es: {
    title: (n: number) => (n === 1 ? '1 alerta necesita tu atención' : `${n} alertas necesitan tu atención`),
    breakdown: {
      CRITICAL: (n: number) => `${n} críticas`,
      HIGH: (n: number) => `${n} altas`,
      MEDIUM: (n: number) => `${n} medias`,
      LOW: (n: number) => `${n} bajas`,
    },
    cta: 'Abrir Inteligencia',
  },
} as const;

const SEVERITY_DOT: Record<InsightSeverity, string> = {
  CRITICAL: 'bg-tribe-danger',
  HIGH: 'bg-tribe-warning',
  MEDIUM: 'bg-tribe-info',
  LOW: 'bg-tribe-dark-60',
};

const SEVERITY_TEXT: Record<InsightSeverity, string> = {
  CRITICAL: 'text-tribe-danger',
  HIGH: 'text-tribe-warning',
  MEDIUM: 'text-tribe-info',
  LOW: 'text-tribe-dark-80',
};

export default function InsightsBanner() {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<BannerState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tribe-os/intelligence/', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { insights: CommunityInsight[] };
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
        const bySeverity: Record<InsightSeverity, number> = {
          CRITICAL: 0,
          HIGH: 0,
          MEDIUM: 0,
          LOW: 0,
        };
        for (const i of insights) bySeverity[i.severity] += 1;
        setState({ kind: 'ready', total: insights.length, bySeverity });
      } catch {
        if (!cancelled) setState({ kind: 'hidden' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind !== 'ready') return null;

  // Severity order matters: render CRITICAL first, LOW last, and
  // only show buckets with a non-zero count so the breakdown stays
  // tight on small screens.
  const orderedSeverities: InsightSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const visibleBreakdown = orderedSeverities.filter((sev) => state.bySeverity[sev] > 0);

  return (
    <Link
      href="/os/intelligence"
      className="flex items-center justify-between gap-3 bg-white rounded-tribe shadow-tribe border border-tribe-dark-40 px-4 py-3 hover:border-tribe-green hover:shadow-tribe-lg transition-all group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-tribe bg-tribe-green-50 flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4 text-tribe-green-dark" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-tribe-dark truncate">{s.title(state.total)}</p>
          <div className="flex items-center gap-3 flex-wrap mt-0.5">
            {visibleBreakdown.map((sev) => (
              <span key={sev} className="inline-flex items-center gap-1 text-xs">
                <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[sev]}`} aria-hidden="true" />
                <span className={SEVERITY_TEXT[sev]}>{s.breakdown[sev](state.bySeverity[sev])}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-tribe-dark-80 group-hover:text-tribe-green-dark shrink-0">
        <span className="hidden sm:inline">{s.cta}</span>
        <ChevronRight className="w-4 h-4" />
      </span>
    </Link>
  );
}
