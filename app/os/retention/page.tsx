'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { buildWhatsAppUrl } from '@/lib/phone';
import { StatCard, Badge, Button } from '@/components/tribe-os/ui';
import { Users, Phone, RotateCcw, MessageCircle, RefreshCw, ChevronDown } from 'lucide-react';

const copy = {
  en: {
    pageTitle: 'Retention',
    subtitle: 'Who needs attention today',
    loadingLabel: 'Loading',
    redirectingLabel: 'Redirecting',
    activeMembersLabel: 'Active members',
    activeMembersSub: 'At least 1 visit in 30d',
    contactTodayLabel: 'Contact today',
    winBackLabel: 'Win back',
    recalculate: 'Recalculate',
    recalculating: 'Recalculating…',
    talkToday: 'Talk to them today',
    viewAll: 'View all',
    viewLess: 'View less',
    winBackSection: 'Win back',
    newMembers: 'New members',
    daysAgo: 'days',
    visits: 'visits',
    noScores: 'No retention scores yet. Press "Recalculate" to generate them.',
    waMessage: (name: string) => `Hola ${name}, ¡te extrañamos en el gym! ¿Cuándo vienes?`,
  },
  es: {
    pageTitle: 'Retención',
    subtitle: 'Quién necesita atención hoy',
    loadingLabel: 'Cargando',
    redirectingLabel: 'Redirigiendo',
    activeMembersLabel: 'Miembros activos',
    activeMembersSub: 'Al menos 1 visita en 30d',
    contactTodayLabel: 'Para contactar hoy',
    winBackLabel: 'Recuperar',
    recalculate: 'Recalcular',
    recalculating: 'Recalculando…',
    talkToday: 'Habla con ellos hoy',
    viewAll: 'Ver todos',
    viewLess: 'Ver menos',
    winBackSection: 'Recuperar',
    newMembers: 'Nuevos',
    daysAgo: 'días',
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

function deduplicateReasons(reasons: string[]): string[] {
  const hasDaysAbsent = reasons.some((r) => r.includes('días sin venir') || r.includes('days absent'));
  if (!hasDaysAbsent) return reasons;
  return reasons.filter((r) => !r.includes('menos que su promedio') && !r.includes('less than average'));
}

export default function RetentionPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [data, setData] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [showAllContact, setShowAllContact] = useState(false);
  const [winBackOpen, setWinBackOpen] = useState(false);

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

  const allMembers = data?.members ?? [];

  const contactToday = allMembers
    .filter(
      (m) =>
        (m.level === 'high' || m.level === 'medium') &&
        m.days_since_last_activity !== null &&
        m.days_since_last_activity >= 7 &&
        m.days_since_last_activity <= 30
    )
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const winBack = allMembers
    .filter((m) => m.days_since_last_activity !== null && m.days_since_last_activity > 30)
    .sort((a, b) => (b.days_since_last_activity ?? 0) - (a.days_since_last_activity ?? 0));

  const activeCount = allMembers.filter((m) => m.visits_last_14d > 0 || m.visits_last_28d > 0).length;

  const newMembers = allMembers.filter((m) => m.level === 'new');

  const contactVisible = showAllContact ? contactToday : contactToday.slice(0, 10);

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
        ) : !data || allMembers.length === 0 ? (
          <p className="text-tribe-dark-80 text-sm py-12 text-center">{s.noScores}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard icon={Users} label={s.activeMembersLabel} value={activeCount} />
              <StatCard icon={Phone} label={s.contactTodayLabel} value={contactToday.length} />
              <StatCard icon={RotateCcw} label={s.winBackLabel} value={winBack.length} />
            </div>

            {contactToday.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-tribe-dark mb-3">{s.talkToday}</h2>
                <div className="space-y-2">
                  {contactVisible.map((m) => (
                    <MemberCard key={m.id} member={m} language={language} s={s} />
                  ))}
                </div>
                {contactToday.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setShowAllContact(!showAllContact)}
                    className="mt-2 text-sm font-medium text-tribe-green-dark hover:underline"
                  >
                    {showAllContact ? s.viewLess : `${s.viewAll} (${contactToday.length})`}
                  </button>
                )}
              </section>
            )}

            {winBack.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setWinBackOpen(!winBackOpen)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <h2 className="text-lg font-bold text-tribe-dark">
                    {s.winBackSection} ({winBack.length})
                  </h2>
                  <ChevronDown
                    className={`h-5 w-5 text-tribe-dark-80 transition-transform ${winBackOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {winBackOpen && (
                  <div className="space-y-2 mt-3">
                    {winBack.map((m) => (
                      <MemberCard key={m.id} member={m} language={language} s={s} />
                    ))}
                  </div>
                )}
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

  const reasons = deduplicateReasons(m.reasons);
  const reasonText = reasons
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
        {reasonText && <p className="text-xs text-tribe-dark-80 mt-0.5 truncate">{reasonText}</p>}
        {m.level === 'new' && m.visits_last_28d > 0 && (
          <p className="text-xs text-tribe-dark-80 mt-0.5">
            {m.visits_last_28d} {s.visits}
          </p>
        )}
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
