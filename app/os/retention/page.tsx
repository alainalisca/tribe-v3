'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { humanizeReason } from '@/lib/tribe-os/forecast';
import { buildWhatsAppUrl } from '@/lib/phone';
import { StatCard, Badge, Button } from '@/components/tribe-os/ui';
import DraftModal from '@/components/tribe-os/DraftModal';
import type { DraftContext } from '@/lib/tribe-os/drafts/templates';
import { filterContactToday } from '@/lib/tribe-os/contactFilter';
import { Users, Phone, RotateCcw, MessageCircle, RefreshCw, ChevronDown, Check } from 'lucide-react';

const copy = {
  en: {
    pageTitle: 'Retention',
    subtitle: 'Who needs attention today',
    loadingLabel: 'Loading',
    redirectingLabel: 'Redirecting',
    activeMembersLabel: 'Active members',
    contactTodayLabel: 'Contact today',
    winBackLabel: 'Win back',
    recalculate: 'Recalculate',
    recalculating: 'Recalculating…',
    talkToday: 'Talk to them today',
    viewAll: 'View all',
    viewLess: 'View less',
    winBackSection: 'Win back',
    newNeedSupport: 'New members who need support',
    newDoingWell: 'New members doing well',
    joinedAgo: (d: number) => (d === 1 ? 'Joined 1 day ago' : `Joined ${d} days ago`),
    visitCount: (n: number) => (n === 1 ? '1 visit' : `${n} visits`),
    noScores: 'No retention scores yet. Press "Recalculate" to generate them.',
    contacted: 'Contacted',
    contactedSection: 'Contacted this week',
    contactedAgo: (d: number) =>
      d === 0 ? 'Contacted today' : d === 1 ? 'Contacted 1 day ago' : `Contacted ${d} days ago`,
    cameBack: 'Came back',
    cameBackAgo: (d: number) =>
      d === 0 ? 'Came back today' : d === 1 ? 'Came back 1 day ago' : `Came back ${d} days ago`,
    undo: 'Undo',
    pending: 'Pending',
    channelWhatsapp: 'WhatsApp',
    channelCall: 'Call',
    channelInPerson: 'In person',
    viaChannel: (ch: string) =>
      ch === 'whatsapp' ? 'via WhatsApp' : ch === 'call' ? 'via call' : ch === 'in_person' ? 'in person' : '',
    waMessage: (name: string) => `Hola ${name}, ¡te extrañamos en el gym! ¿Cuándo vienes?`,
  },
  es: {
    pageTitle: 'Retención',
    subtitle: 'Quién necesita atención hoy',
    loadingLabel: 'Cargando',
    redirectingLabel: 'Redirigiendo',
    activeMembersLabel: 'Miembros activos',
    contactTodayLabel: 'Para contactar hoy',
    winBackLabel: 'Recuperar',
    recalculate: 'Recalcular',
    recalculating: 'Recalculando…',
    talkToday: 'Habla con ellos hoy',
    viewAll: 'Ver todos',
    viewLess: 'Ver menos',
    winBackSection: 'Recuperar',
    newNeedSupport: 'Nuevos que necesitan apoyo',
    newDoingWell: 'Nuevos que van bien',
    joinedAgo: (d: number) => (d === 1 ? 'Se unió hace 1 día' : `Se unió hace ${d} días`),
    visitCount: (n: number) => (n === 1 ? '1 visita' : `${n} visitas`),
    noScores: 'No hay puntajes todavía. Presiona "Recalcular" para generarlos.',
    contacted: 'Contactado',
    contactedSection: 'Contactados esta semana',
    contactedAgo: (d: number) =>
      d === 0 ? 'Contactado hoy' : d === 1 ? 'Contactado hace 1 día' : `Contactado hace ${d} días`,
    cameBack: 'Volvió',
    cameBackAgo: (d: number) => (d === 0 ? 'Volvió hoy' : d === 1 ? 'Volvió hace 1 día' : `Volvió hace ${d} días`),
    undo: 'Deshacer',
    pending: 'Pendiente',
    channelWhatsapp: 'WhatsApp',
    channelCall: 'Llamada',
    channelInPerson: 'En persona',
    viaChannel: (ch: string) =>
      ch === 'whatsapp' ? 'por WhatsApp' : ch === 'call' ? 'por llamada' : ch === 'in_person' ? 'en persona' : '',
    waMessage: (name: string) => `Hola ${name}, ¡te extrañamos en el gym! ¿Cuándo vienes?`,
  },
} as const;

interface MemberRow {
  id: string;
  external_id: string | null;
  name: string | null;
  phone: string | null;
  joined_on: string | null;
  tags: string[] | null;
  plan_ends_on: string | null;
  score: number | null;
  level: string | null;
  reasons: string[];
  days_since_last_activity: number | null;
  last_activity_at: string | null;
  visits_last_14d: number;
  visits_last_28d: number;
  computed_at: string | null;
  last_touch: { id: string; channel: string; created_at: string } | null;
  last_visit_coach: string | null;
  last_visit_class: string | null;
  last_visit_at: string | null;
}

interface RetentionData {
  members: MemberRow[];
  coachDisplayName: string | null;
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
  return reasons.filter(
    (r) =>
      !r.includes('menos que su promedio') &&
      !r.includes('less than average') &&
      !r.includes('Sin visitas en 14') &&
      !r.includes('No visits in 14d')
  );
}

function daysSinceJoined(joinedOn: string | null): number | null {
  if (!joinedOn) return null;
  return Math.floor((Date.now() - new Date(joinedOn).getTime()) / 86_400_000);
}

const GYM_TZ = 'America/Bogota';

function daysAgoInTz(isoString: string, tz: string, now?: Date): number {
  const ref = now ?? new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const toMs = (d: Date) => {
    const p = fmt.formatToParts(d);
    return Date.UTC(
      Number(p.find((x) => x.type === 'year')!.value),
      Number(p.find((x) => x.type === 'month')!.value) - 1,
      Number(p.find((x) => x.type === 'day')!.value)
    );
  };
  return Math.round((toMs(ref) - toMs(new Date(isoString))) / 86_400_000);
}

function getNextStep(reasons: string[], language: 'en' | 'es'): string | null {
  const hasExpired = reasons.some((r) => r.includes('plan venció') || r.includes('Plan expired'));
  if (hasExpired) {
    return language === 'es' ? 'Plan vencido: ofrécele renovar hoy' : 'Plan expired: offer to renew today';
  }
  const hasExpiring = reasons.some(
    (r) => (r.includes('plan vence') || r.includes('Plan expires')) && !r.includes('venció')
  );
  if (hasExpiring) {
    return language === 'es' ? 'Su plan vence pronto: confirma la renovación' : 'Plan expiring soon: confirm renewal';
  }
  const hasTrend = reasons.some((r) => r.includes('menos que su promedio') || r.includes('less than average'));
  if (hasTrend) {
    return language === 'es'
      ? 'Aún viene menos que antes: invítale a la próxima clase'
      : 'Still visiting less: invite them to the next class';
  }
  return null;
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
  const [wellOpen, setWellOpen] = useState(false);
  const [contactedOpen, setContactedOpen] = useState(false);
  const [draftTarget, setDraftTarget] = useState<{ member: MemberRow; cameBack?: boolean } | null>(null);
  const contactRef = useRef<HTMLElement>(null);
  const winBackRef = useRef<HTMLElement>(null);

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

  const recordTouch = useCallback(
    async (clientId: string, channel: 'whatsapp' | 'call' | 'in_person' | 'other', note?: string) => {
      try {
        const res = await fetch('/api/tribe-os/retention/touches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, channel, note: note || undefined }),
        });
        const json = await res.json();
        if (json.success) {
          trackEvent(channel === 'whatsapp' ? 'tribe_os_retention_touch_whatsapp' : 'tribe_os_retention_touch_manual');
          await fetchScores();
        }
      } catch {}
    },
    [fetchScores]
  );

  const undoTouch = useCallback(
    async (touchId: string) => {
      try {
        const res = await fetch('/api/tribe-os/retention/touches', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ touch_id: touchId }),
        });
        const json = await res.json();
        if (json.success) await fetchScores();
      } catch {}
    },
    [fetchScores]
  );

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

  // Contacted this week: ANY member with a touch in the last 7 days, regardless of level
  const contactedIds = new Set<string>();
  const contactedThisWeek = allMembers
    .filter((m) => m.last_touch !== null)
    .map((m) => {
      contactedIds.add(m.id);
      const cameBack =
        m.last_touch != null &&
        m.last_activity_at != null &&
        new Date(m.last_activity_at) > new Date(m.last_touch.created_at);
      return { ...m, cameBack };
    })
    .sort((a, b) => {
      if (a.cameBack !== b.cameBack) return a.cameBack ? -1 : 1;
      return new Date(b.last_touch!.created_at).getTime() - new Date(a.last_touch!.created_at).getTime();
    });

  // Contact today: shared filter (high/medium, 7–30 days, no touch in 7 days)
  const contactToday = filterContactToday(allMembers);

  // Win back: >30 days absent, NOT already contacted this week
  const winBack = allMembers
    .filter((m) => !contactedIds.has(m.id) && m.days_since_last_activity !== null && m.days_since_last_activity > 30)
    .sort((a, b) => (b.days_since_last_activity ?? 0) - (a.days_since_last_activity ?? 0));

  const activeCount = allMembers.filter((m) => m.visits_last_14d > 0 || m.visits_last_28d > 0).length;

  const newAll = allMembers.filter((m) => m.level === 'new');

  const newNeedSupport = newAll
    .filter((m) => {
      const dj = daysSinceJoined(m.joined_on);
      if (dj === null || dj === 0) return false;
      const weeksSinceJoin = dj / 7;
      const totalVisits = m.visits_last_28d;
      const pace = totalVisits / weeksSinceJoin;
      if (pace < 1.5) return true;
      if (m.days_since_last_activity !== null && m.days_since_last_activity >= 5) return true;
      return false;
    })
    .sort((a, b) => (a.visits_last_28d ?? 0) - (b.visits_last_28d ?? 0))
    .slice(0, 5);

  const newSupportIds = new Set(newNeedSupport.map((m) => m.id));
  const newDoingWell = newAll.filter((m) => !newSupportIds.has(m.id));

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
              <StatCard
                icon={Users}
                label={s.activeMembersLabel}
                value={activeCount}
                changeLabel=""
                className="cursor-pointer hover:ring-2 hover:ring-tribe-green/40 transition-shadow"
                onClick={() => (window.location.href = '/os/members')}
              />
              <StatCard
                icon={Phone}
                label={s.contactTodayLabel}
                value={contactToday.length}
                changeLabel=""
                className="cursor-pointer hover:ring-2 hover:ring-tribe-green/40 transition-shadow"
                onClick={() => contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              />
              <StatCard
                icon={RotateCcw}
                label={s.winBackLabel}
                value={winBack.length}
                changeLabel=""
                className="cursor-pointer hover:ring-2 hover:ring-tribe-green/40 transition-shadow"
                onClick={() => {
                  if (!winBackOpen) setWinBackOpen(true);
                  setTimeout(() => winBackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                }}
              />
            </div>

            {contactToday.length > 0 && (
              <section ref={contactRef}>
                <h2 className="text-lg font-bold text-tribe-dark mb-3">{s.talkToday}</h2>
                <div className="space-y-2">
                  {contactVisible.map((m) => (
                    <MemberCard
                      key={m.id}
                      member={m}
                      language={language}
                      s={s}
                      onTouch={recordTouch}
                      onDraft={(member) => setDraftTarget({ member })}
                    />
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
              <section ref={winBackRef}>
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
                      <MemberCard
                        key={m.id}
                        member={m}
                        language={language}
                        s={s}
                        onTouch={recordTouch}
                        onDraft={(member) => setDraftTarget({ member })}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {contactedThisWeek.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setContactedOpen(!contactedOpen)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <h2 className="text-lg font-bold text-tribe-dark">
                    {s.contactedSection} ({contactedThisWeek.length})
                  </h2>
                  <ChevronDown
                    className={`h-5 w-5 text-tribe-dark-80 transition-transform ${contactedOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {contactedOpen && (
                  <div className="space-y-2 mt-3">
                    {contactedThisWeek.map((m) => (
                      <ContactedCard
                        key={m.id}
                        member={m}
                        cameBack={m.cameBack}
                        language={language}
                        s={s}
                        onUndo={undoTouch}
                        onDraft={(member, cb) => setDraftTarget({ member, cameBack: cb })}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {newNeedSupport.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-tribe-dark mb-3">{s.newNeedSupport}</h2>
                <div className="space-y-2">
                  {newNeedSupport.map((m) => (
                    <NewMemberCard key={m.id} member={m} language={language} s={s} />
                  ))}
                </div>
              </section>
            )}

            {newDoingWell.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setWellOpen(!wellOpen)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <h2 className="text-lg font-bold text-tribe-dark">
                    {s.newDoingWell} ({newDoingWell.length})
                  </h2>
                  <ChevronDown
                    className={`h-5 w-5 text-tribe-dark-80 transition-transform ${wellOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {wellOpen && (
                  <div className="space-y-2 mt-3">
                    {newDoingWell.map((m) => (
                      <NewMemberCard key={m.id} member={m} language={language} s={s} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {draftTarget && (
          <DraftModal
            open={!!draftTarget}
            onClose={() => setDraftTarget(null)}
            context={
              {
                memberId: draftTarget.member.id,
                memberName: draftTarget.member.name,
                phone: draftTarget.member.phone,
                reasons: draftTarget.member.reasons,
                daysSinceLastActivity: draftTarget.member.days_since_last_activity,
                lastActivityAt: draftTarget.member.last_activity_at,
                lastTouchCreatedAt: draftTarget.member.last_touch?.created_at ?? null,
                cameBack: draftTarget.cameBack,
                coachName: draftTarget.member.last_visit_coach,
                className: draftTarget.member.last_visit_class,
                classStartTime: draftTarget.member.last_visit_at,
                planEndsOn: draftTarget.member.plan_ends_on,
                loggedInCoachName: data?.coachDisplayName ?? null,
                language,
              } satisfies DraftContext
            }
            onTouchRecorded={fetchScores}
          />
        )}
      </div>
    </div>
  );
}

type Channel = 'whatsapp' | 'call' | 'in_person' | 'other';

function MemberCard({
  member: m,
  language,
  s,
  onTouch,
  onDraft,
}: {
  member: MemberRow;
  language: 'en' | 'es';
  s: (typeof copy)['en'] | (typeof copy)['es'];
  onTouch: (clientId: string, channel: Channel, note?: string) => void;
  onDraft: (member: MemberRow) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState('');
  const badge = levelBadge[m.level ?? 'insufficient_data'] ?? levelBadge.insufficient_data;

  const reasons = deduplicateReasons(m.reasons);
  const reasonText = reasons
    .map((r) => {
      const parts = r.split(' / ');
      const localized = language === 'es' ? parts[0] : (parts[1] ?? parts[0]);
      return humanizeReason(localized, m.last_activity_at, language);
    })
    .join(' · ');

  const pickChannel = (ch: Channel) => {
    const trimmed = note.trim();
    setPicking(false);
    setNote('');
    onTouch(m.id, ch, trimmed || undefined);
  };

  return (
    <div className="bg-white rounded-tribe shadow-tribe px-4 py-3">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-tribe-dark truncate">{m.name ?? 'Sin nombre'}</span>
            <Badge variant={badge.variant}>{language === 'es' ? badge.es : badge.en}</Badge>
          </div>
          {reasonText && <p className="text-xs text-tribe-dark-80 mt-0.5 truncate">{reasonText}</p>}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          {!picking && (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-tribe bg-gray-100 text-tribe-dark hover:bg-gray-200 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              {s.contacted}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDraft(m)}
            className="shrink-0 p-2 rounded-tribe bg-tribe-green-50 hover:bg-tribe-green transition-colors"
            aria-label={`${language === 'es' ? 'Redactar para' : 'Draft for'} ${firstName(m.name)}`}
          >
            <MessageCircle className="h-5 w-5 text-tribe-green-dark" />
          </button>
        </div>
      </div>
      {picking && (
        <div className="mt-2 space-y-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder={language === 'es' ? 'Nota breve (opcional)' : 'Short note (optional)'}
            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-tribe bg-white focus:outline-none focus:ring-2 focus:ring-tribe-green/30"
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => pickChannel('whatsapp')}
              className="px-2 py-1 text-[11px] font-medium rounded-tribe bg-tribe-green-50 text-tribe-green-dark hover:bg-tribe-green transition-colors"
            >
              {s.channelWhatsapp}
            </button>
            <button
              type="button"
              onClick={() => pickChannel('call')}
              className="px-2 py-1 text-[11px] font-medium rounded-tribe bg-gray-100 text-tribe-dark hover:bg-gray-200 transition-colors"
            >
              {s.channelCall}
            </button>
            <button
              type="button"
              onClick={() => pickChannel('in_person')}
              className="px-2 py-1 text-[11px] font-medium rounded-tribe bg-gray-100 text-tribe-dark hover:bg-gray-200 transition-colors"
            >
              {s.channelInPerson}
            </button>
            <button
              type="button"
              onClick={() => { setPicking(false); setNote(''); }}
              className="ml-auto px-2 py-1 text-[11px] font-medium rounded-tribe text-gray-500 hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactedCard({
  member: m,
  cameBack,
  language,
  s,
  onUndo,
  onDraft,
}: {
  member: MemberRow;
  cameBack: boolean;
  language: 'en' | 'es';
  s: (typeof copy)['en'] | (typeof copy)['es'];
  onUndo: (touchId: string) => void;
  onDraft: (member: MemberRow, cameBack: boolean) => void;
}) {
  const badge = levelBadge[m.level ?? 'insufficient_data'] ?? levelBadge.insufficient_data;

  const touchDaysAgo = m.last_touch ? daysAgoInTz(m.last_touch.created_at, GYM_TZ) : 0;
  const visitDaysAgo = cameBack && m.last_activity_at ? daysAgoInTz(m.last_activity_at, GYM_TZ) : null;
  const channelLabel = m.last_touch ? s.viaChannel(m.last_touch.channel) : '';

  const nextStep = cameBack && (m.level === 'high' || m.level === 'medium') ? getNextStep(m.reasons, language) : null;

  let subtitle: string;
  if (cameBack && visitDaysAgo !== null) {
    const cameBackPart = s.cameBackAgo(visitDaysAgo);
    const agoLabel =
      language === 'es'
        ? touchDaysAgo === 0
          ? 'hoy'
          : touchDaysAgo === 1
            ? 'hace 1 día'
            : `hace ${touchDaysAgo} días`
        : touchDaysAgo === 0
          ? 'today'
          : touchDaysAgo === 1
            ? '1 day ago'
            : `${touchDaysAgo} days ago`;
    const contactedPart =
      language === 'es' ? `contactado ${channelLabel} ${agoLabel}` : `contacted ${channelLabel} ${agoLabel}`;
    subtitle = `${cameBackPart} · ${contactedPart}`;
  } else {
    subtitle = `${s.contactedAgo(touchDaysAgo)}${channelLabel ? ` ${channelLabel}` : ''}`;
  }

  return (
    <div className="bg-white rounded-tribe shadow-tribe px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-tribe-dark truncate">{m.name ?? 'Sin nombre'}</span>
          {cameBack ? (
            <>
              <Badge variant="success">{s.cameBack}</Badge>
              {nextStep && <Badge variant="warning">{s.pending}</Badge>}
            </>
          ) : (
            <Badge variant={badge.variant}>{language === 'es' ? badge.es : badge.en}</Badge>
          )}
        </div>
        <p className="text-xs text-tribe-dark-80 mt-0.5 truncate">{subtitle}</p>
        {nextStep && <p className="text-xs text-amber-700 mt-0.5 truncate">{nextStep}</p>}
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onDraft(m, cameBack)}
          className="p-1.5 rounded-tribe bg-tribe-green-50 hover:bg-tribe-green transition-colors"
          aria-label={`${language === 'es' ? 'Redactar para' : 'Draft for'} ${firstName(m.name)}`}
        >
          <MessageCircle className="h-4 w-4 text-tribe-green-dark" />
        </button>
        {m.last_touch && (
          <button
            type="button"
            onClick={() => onUndo(m.last_touch!.id)}
            className="text-xs text-tribe-dark-80 hover:text-red-600 transition-colors"
          >
            {s.undo}
          </button>
        )}
      </div>
    </div>
  );
}

function NewMemberCard({
  member: m,
  language,
  s,
  onTouch,
}: {
  member: MemberRow;
  language: 'en' | 'es';
  s: (typeof copy)['en'] | (typeof copy)['es'];
  onTouch?: (clientId: string, channel: 'whatsapp' | 'call' | 'in_person' | 'other') => void;
}) {
  const waUrl = buildWhatsAppUrl(m.phone, {
    message: s.waMessage(firstName(m.name)),
  });

  const dj = daysSinceJoined(m.joined_on);
  const joinedLabel = dj !== null ? s.joinedAgo(dj) : '';
  const visitLabel = s.visitCount(m.visits_last_28d);

  return (
    <div className="bg-white rounded-tribe shadow-tribe px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-tribe-dark truncate">{m.name ?? 'Sin nombre'}</span>
          <Badge variant="info">{language === 'es' ? 'Nuevo' : 'New'}</Badge>
        </div>
        <p className="text-xs text-tribe-dark-80 mt-0.5">
          {joinedLabel}
          {joinedLabel && visitLabel ? ' · ' : ''}
          {visitLabel}
        </p>
      </div>
      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onTouch?.(m.id, 'whatsapp')}
          className="shrink-0 p-2 rounded-tribe bg-tribe-green-50 hover:bg-tribe-green transition-colors"
          aria-label={`WhatsApp ${firstName(m.name)}`}
        >
          <MessageCircle className="h-5 w-5 text-tribe-green-dark" />
        </a>
      )}
    </div>
  );
}
