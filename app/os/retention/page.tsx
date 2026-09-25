'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { buildWhatsAppUrl } from '@/lib/phone';
import { StatCard, Badge, Button } from '@/components/tribe-os/ui';
import { Users, AlertTriangle, Activity, MessageCircle, RefreshCw } from 'lucide-react';

const copy = {
  en: {
    pageTitle: 'Retention',
    subtitle: 'Who needs attention today',
    loadingLabel: 'Loading',
    redirectingLabel: 'Redirecting',
    activeMembers: 'Active (7d)',
    highRisk: 'High risk',
    recentVisitors: 'Visited last 7d',
    recalculate: 'Recalculate',
    recalculating: 'Recalculating…',
    talkToday: 'Talk to them today',
    newMembers: 'New members',
    daysAgo: 'days ago',
    lastVisit: 'Last visit',
    noVisit: 'No visits',
    visits: 'visits',
    noScores: 'No retention scores yet. Press "Recalculate" to generate them.',
    waMessage: (name: string) => `Hola ${name}, ¡te extrañamos en el gym! ¿Cuándo vienes?`,
  },
  es: {
    pageTitle: 'Retención',
    subtitle: 'Quién necesita atención hoy',
    loadingLabel: 'Cargando',
    redirectingLabel: 'Redirigiendo',
    activeMembers: 'Activos (7d)',
    highRisk: 'Alto riesgo',
    recentVisitors: 'Vinieron en 7d',
    recalculate: 'Recalcular',
    recalculating: 'Recalculando…',
    talkToday: 'Habla con ellos hoy',
    newMembers: 'Nuevos',
    daysAgo: 'días',
    lastVisit: 'Última visita',
    noVisit: 'Sin visitas',
    visits: 'visitas',
    noScores: 'No hay puntajes todavía. Presiona "Recalcular" para generarlos.',
    waMessage: (name: string) => `Hola ${name}, ¡te extrañamos en el gym! ¿Cuándo vienes?`,
  },
} as const;

interface MemberRow {
  id: string;
  name: string | null;
  phone: string | null;
  joined_on: string | null;
  tags: string[] | null;
  score: number | null;
  level: string | null;
  reasons: string[];
  days_since_last_activity: number | null;
  visits_last_14d: number;
  visits_last_28d: number;
  computed_at: string | null;
}

interface RetentionData {
  members: MemberRow[];
  stats: { activeMembers: number; highRisk: number; recentVisitors: number };
}

const levelBadge: Record<
  string,
  { variant: 'danger' | 'warning' | 'success' | 'info' | 'default'; en: string; es: string }
> = {
  high: { variant: 'danger', en: 'High', es: 'Alto' },
  medium: { variant: 'warning', en: 'Medium', es: 'Medio' },
  low: { variant: 'success', en: 'Low', es: 'Bajo' },
  new: { variant: 'info', en: 'New', es: 'Nuevo' },
  insufficient_data: { variant: 'default', en: 'No data', es: 'Sin datos' },
};

function firstName(name: string | null): string {
  if (!name) return '';
  return name.split(' ')[0];
}

export default function RetentionPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [data, setData] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const fetchScores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tribe-os/retention/scores');
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (gate.state === 'allowed') {
      trackEvent('tribe_os_retention_viewed');
      fetchScores();
    }
  }, [gate.state, fetchScores]);

  const handleRecompute = async () => {
    setRecomputing(true);
    trackEvent('tribe_os_retention_recomputed');
    try {
      await fetch('/api/tribe-os/retention/recompute', { method: 'POST' });
      await fetchScores();
    } finally {
      setRecomputing(false);
    }
  };

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-tribe-dark-80 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : s.loadingLabel}...
        </p>
      </main>
    );
  }

  const atRisk = (data?.members ?? [])
    .filter((m) => m.level === 'high' || m.level === 'medium')
    .sort((a, b) => {
      if (a.level === 'high' && b.level !== 'high') return -1;
      if (a.level !== 'high' && b.level === 'high') return 1;
      return (b.days_since_last_activity ?? 0) - (a.days_since_last_activity ?? 0);
    });

  const newMembers = (data?.members ?? []).filter((m) => m.level === 'new');

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-tribe-dark">{s.pageTitle}</h1>
            <p className="text-sm text-tribe-dark-80 mt-1">{s.subtitle}</p>
          </div>
          <Button onClick={handleRecompute} loading={recomputing} size="sm" variant="secondary">
            <RefreshCw className="h-4 w-4 mr-2" />
            {recomputing ? s.recalculating : s.recalculate}
          </Button>
        </header>

        {loading ? (
          <p className="text-tribe-dark-80 text-sm py-12 text-center">{s.loadingLabel}...</p>
        ) : !data || data.members.length === 0 ? (
          <p className="text-tribe-dark-80 text-sm py-12 text-center">{s.noScores}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard icon={Activity} label={s.recentVisitors} value={data.stats.recentVisitors} />
              <StatCard icon={AlertTriangle} label={s.highRisk} value={data.stats.highRisk} />
              <StatCard icon={Users} label={s.activeMembers} value={data.stats.activeMembers} />
            </div>

            {atRisk.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-tribe-dark mb-3">{s.talkToday}</h2>
                <div className="space-y-2">
                  {atRisk.map((m) => (
                    <MemberCard key={m.id} member={m} language={language} s={s} />
                  ))}
                </div>
              </section>
            )}

            {newMembers.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-tribe-dark mb-3">{s.newMembers}</h2>
                <div className="space-y-2">
                  {newMembers.map((m) => (
                    <MemberCard key={m.id} member={m} language={language} s={s} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MemberCard({
  member: m,
  language,
  s,
}: {
  member: MemberRow;
  language: 'en' | 'es';
  s: (typeof copy)['en'] | (typeof copy)['es'];
}) {
  const badge = levelBadge[m.level ?? 'insufficient_data'] ?? levelBadge.insufficient_data;
  const waUrl = buildWhatsAppUrl(m.phone, {
    message: s.waMessage(firstName(m.name)),
  });

  const lastVisitLabel =
    m.days_since_last_activity !== null ? `${s.lastVisit}: ${m.days_since_last_activity} ${s.daysAgo}` : s.noVisit;

  const reasonText = m.reasons
    .map((r) => {
      const parts = r.split(' / ');
      return language === 'es' ? parts[0] : (parts[1] ?? parts[0]);
    })
    .join(' · ');

  return (
    <div className="bg-white rounded-tribe shadow-tribe px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-tribe-dark truncate">{m.name ?? 'Sin nombre'}</span>
          <Badge variant={badge.variant}>{language === 'es' ? badge.es : badge.en}</Badge>
        </div>
        <p className="text-xs text-tribe-dark-80 mt-0.5 truncate">
          {lastVisitLabel}
          {m.level === 'new' && m.visits_last_28d > 0 ? ` · ${m.visits_last_28d} ${s.visits}` : ''}
        </p>
        {reasonText && <p className="text-xs text-tribe-dark-80 mt-0.5 truncate">{reasonText}</p>}
      </div>
      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-2 rounded-tribe bg-tribe-green-50 hover:bg-tribe-green transition-colors"
          aria-label={`WhatsApp ${firstName(m.name)}`}
        >
          <MessageCircle className="h-5 w-5 text-tribe-green-dark" />
        </a>
      )}
    </div>
  );
}
