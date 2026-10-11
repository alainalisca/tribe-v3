'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { MessageSquare, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';

const copy = {
  en: {
    pageTitle: 'Messages',
    subtitle: 'Contact history',
    loading: 'Loading',
    redirecting: 'Redirecting',
    emptyTitle: "You haven't contacted anyone yet.",
    emptyHint: 'Start in Retention.',
    filterAll: 'All',
    filterWhatsApp: 'WhatsApp',
    filterCall: 'Call',
    filterInPerson: 'In person',
    filterOther: 'Other',
    outcomeCameBack: (d: number) => `Came back in ${d}d`,
    outcomeWaiting: 'Waiting',
    outcomeNoResponse: 'No response',
    summaryContacts: 'Last 28 days',
    summaryCameBack: 'Came back',
    summaryConversion: 'Conversion',
    searchPlaceholder: 'Search member…',
    prev: 'Previous',
    next: 'Next',
    pageOf: (p: number, t: number) => `Page ${p} of ${t}`,
    by: 'by',
    noResults: 'No results',
  },
  es: {
    pageTitle: 'Mensajes',
    subtitle: 'Historial de contacto',
    loading: 'Cargando',
    redirecting: 'Redirigiendo',
    emptyTitle: 'Aún no has contactado a nadie.',
    emptyHint: 'Empieza en Retención.',
    filterAll: 'Todos',
    filterWhatsApp: 'WhatsApp',
    filterCall: 'Llamada',
    filterInPerson: 'En persona',
    filterOther: 'Otro',
    outcomeCameBack: (d: number) => `Volvió en ${d} días`,
    outcomeWaiting: 'Esperando',
    outcomeNoResponse: 'Sin respuesta',
    summaryContacts: 'Últimos 28 días',
    summaryCameBack: 'Volvieron',
    summaryConversion: 'Conversión',
    searchPlaceholder: 'Buscar miembro…',
    prev: 'Anterior',
    next: 'Siguiente',
    pageOf: (p: number, t: number) => `Página ${p} de ${t}`,
    by: 'por',
    noResults: 'Sin resultados',
  },
} as const;

const CHANNEL_LABELS: Record<string, { en: string; es: string }> = {
  whatsapp: { en: 'WhatsApp', es: 'WhatsApp' },
  call: { en: 'Call', es: 'Llamada' },
  in_person: { en: 'In person', es: 'En persona' },
  other: { en: 'Other', es: 'Otro' },
};

const OUTCOME_FILTERS = ['all', 'came_back', 'waiting', 'no_response'] as const;

interface TouchItem {
  id: string;
  client_id: string;
  client_name: string | null;
  channel: string;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
  outcome: 'came_back' | 'waiting' | 'no_response';
  came_back_days: number | null;
}

interface Summary {
  month_total: number;
  month_came_back: number;
  conversion_pct: number;
  conversion_label: string | null;
}

interface MessagesData {
  touches: TouchItem[];
  total: number;
  page: number;
  per_page: number;
  summary: Summary;
}

function formatRelativeTime(iso: string, lang: 'en' | 'es'): string {
  const d = new Date(iso);
  const now = new Date();
  const bogota = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const touchBogota = new Date(d.toLocaleString('en-US', { timeZone: 'America/Bogota' }));

  const todayStr = bogota.toLocaleDateString('en-CA');
  const touchStr = touchBogota.toLocaleDateString('en-CA');

  const time = touchBogota.toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (todayStr === touchStr) {
    return `${lang === 'es' ? 'hoy' : 'today'} ${time}`;
  }

  const yesterday = new Date(bogota);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toLocaleDateString('en-CA') === touchStr) {
    return lang === 'es' ? 'ayer' : 'yesterday';
  }

  const diffDays = Math.floor((bogota.getTime() - touchBogota.getTime()) / 86_400_000);
  if (diffDays >= 2 && diffDays <= 6) {
    const weekdays = lang === 'es'
      ? ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
      : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `${lang === 'es' ? 'el ' : ''}${weekdays[touchBogota.getDay()]}`;
  }

  return touchBogota.toLocaleDateString(lang === 'es' ? 'es-CO' : 'en-US', {
    day: 'numeric',
    month: 'short',
  });
}

export default function MessagesPage() {
  const { language } = useLanguage();
  const gate = useTribeOSPremiumGate();
  const s = copy[language];

  const [data, setData] = useState<MessagesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('per_page', '25');
      if (channelFilter) params.set('channel', channelFilter);
      if (outcomeFilter) params.set('outcome', outcomeFilter);
      if (searchDebounced) params.set('search', searchDebounced);

      const res = await fetch(`/api/tribe-os/messages?${params}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [page, channelFilter, outcomeFilter, searchDebounced]);

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    trackEvent('tribe_os_messages_viewed');
    fetchData();
  }, [gate.state, fetchData]);

  useEffect(() => {
    setPage(1);
  }, [channelFilter, outcomeFilter, searchDebounced]);

  if (gate.state === 'redirecting') {
    return <p className="p-8 text-sm text-gray-500">{s.redirecting}</p>;
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">{s.pageTitle}</h1>
        <p className="text-sm text-gray-500">{s.subtitle}</p>
      </div>

      {/* Summary row */}
      {data && (data.summary.month_total > 0 || data.touches.length > 0) && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{data.summary.month_total}</p>
            <p className="text-[11px] text-gray-500">{s.summaryContacts}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className="text-2xl font-bold text-tribe-green">{data.summary.month_came_back}</p>
            <p className="text-[11px] text-gray-500">{s.summaryCameBack}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {data.summary.conversion_label ?? `${data.summary.conversion_pct}%`}
            </p>
            <p className="text-[11px] text-gray-500">{s.summaryConversion}</p>
          </div>
        </div>
      )}

      {/* Search + channel filter */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={s.searchPlaceholder}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-tribe-green/30"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {['', 'whatsapp', 'call', 'in_person', 'other'].map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannelFilter(ch)}
              className={`shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                channelFilter === ch
                  ? 'bg-tribe-green text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {ch === '' ? s.filterAll : (CHANNEL_LABELS[ch]?.[language] ?? ch)}
            </button>
          ))}
        </div>
      </div>

      {/* Outcome filter */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {OUTCOME_FILTERS.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOutcomeFilter(o === 'all' ? '' : o)}
            className={`shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              (o === 'all' && outcomeFilter === '') || outcomeFilter === o
                ? 'bg-tribe-green text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {o === 'all'
              ? s.filterAll
              : o === 'came_back'
                ? (language === 'es' ? 'Volvió' : 'Came back')
                : o === 'waiting'
                  ? s.outcomeWaiting
                  : s.outcomeNoResponse}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && !data && (
        <p className="p-8 text-sm text-gray-500 text-center">{s.loading}…</p>
      )}

      {/* Empty state */}
      {data && data.touches.length === 0 && !channelFilter && !outcomeFilter && !searchDebounced && (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
          <MessageSquare className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm font-semibold text-gray-900 mb-1">{s.emptyTitle}</p>
          <p className="text-xs text-gray-500">
            <Link href="/os/retention" className="text-tribe-green hover:underline">
              {s.emptyHint}
            </Link>
          </p>
        </div>
      )}

      {/* Filtered empty */}
      {data && data.touches.length === 0 && (channelFilter || outcomeFilter || searchDebounced) && (
        <p className="p-8 text-sm text-gray-500 text-center">{s.noResults}</p>
      )}

      {/* Timeline */}
      {data && data.touches.length > 0 && (
        <>
          <ul className="space-y-2">
            {data.touches.map((t) => (
              <li key={t.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/os/clients/${t.client_id}`}
                        className="font-semibold text-sm text-gray-900 hover:text-tribe-green transition-colors truncate"
                      >
                        {t.client_name ?? 'Sin nombre'}
                      </Link>
                      <span className="text-[11px] text-gray-500">
                        {CHANNEL_LABELS[t.channel]?.[language] ?? t.channel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                      <span>{formatRelativeTime(t.created_at, language)}</span>
                      {t.created_by_name && (
                        <span>· {s.by} {t.created_by_name}</span>
                      )}
                    </div>
                    {t.note && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">{t.note}</p>
                    )}
                  </div>
                  <OutcomeBadge outcome={t.outcome} days={t.came_back_days} s={s} />
                </div>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {s.prev}
              </button>
              <span className="text-xs text-gray-500">{s.pageOf(page, totalPages)}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 transition-colors"
              >
                {s.next}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OutcomeBadge({
  outcome,
  days,
  s,
}: {
  outcome: 'came_back' | 'waiting' | 'no_response';
  days: number | null;
  s: (typeof copy)['en'] | (typeof copy)['es'];
}) {
  if (outcome === 'came_back') {
    return (
      <span className="shrink-0 inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-green-50 text-green-700 border border-green-200">
        {s.outcomeCameBack(days ?? 0)}
      </span>
    );
  }
  if (outcome === 'waiting') {
    return (
      <span className="shrink-0 inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
        {s.outcomeWaiting}
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 text-gray-500 border border-gray-200">
      {s.outcomeNoResponse}
    </span>
  );
}
