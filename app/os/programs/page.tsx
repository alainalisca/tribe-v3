'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Dumbbell } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { showError } from '@/lib/toast';
import { Badge, Button } from '@/components/tribe-os/ui';
import { formatShortDateBi } from '@/lib/tribe-os/dates';
import { PROGRAM_STATUSES } from '@/lib/tribe-os/programs/constants';
import type { ProgramStatus } from '@/lib/tribe-os/programs/constants';

const STATUS_COLORS: Record<ProgramStatus, 'info' | 'success' | 'warning' | 'danger' | 'default'> = {
  draft: 'default',
  active: 'success',
  archived: 'warning',
};

const copy = {
  en: {
    pageTitle: 'Programs',
    subtitle: 'Organize training blocks and track member attendance',
    loading: 'Loading',
    redirecting: 'Redirecting',
    searchPlaceholder: 'Search programs…',
    addProgram: 'New Program',
    tab: {
      all: 'All',
      draft: 'Draft',
      active: 'Active',
      archived: 'Archived',
    },
    empty: 'No programs yet.',
    emptyHint: 'Create your first program to start tracking member attendance.',
    noMatch: 'No programs match these filters.',
    errorLoad: 'Could not load programs.',
    sessions: 'sessions/week',
    sport: 'Sport',
    dates: 'Dates',
  },
  es: {
    pageTitle: 'Programas',
    subtitle: 'Organiza bloques de entrenamiento y sigue la asistencia',
    loading: 'Cargando',
    redirecting: 'Redirigiendo',
    searchPlaceholder: 'Buscar programas…',
    addProgram: 'Nuevo programa',
    tab: {
      all: 'Todos',
      draft: 'Borrador',
      active: 'Activo',
      archived: 'Archivado',
    },
    empty: 'Sin programas aún.',
    emptyHint: 'Crea tu primer programa para empezar a hacer seguimiento.',
    noMatch: 'Ningún programa coincide con estos filtros.',
    errorLoad: 'No se pudo cargar los programas.',
    sessions: 'sesiones/semana',
    sport: 'Deporte',
    dates: 'Fechas',
  },
} as const;

interface ProgramRow {
  id: string;
  name: string;
  sport: string | null;
  status: ProgramStatus;
  starts_at: string | null;
  ends_at: string | null;
  target_sessions_per_week: number | null;
  created_at: string;
  updated_at: string;
}

type TabFilter = 'all' | ProgramStatus;

export default function ProgramsPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>('all');
  const [search, setSearch] = useState('');

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tribe-os/programs');
      const json = await res.json();
      if (json.success) setPrograms(json.data);
      else showError(s.errorLoad);
    } catch {
      showError(s.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [s.errorLoad]);

  useEffect(() => {
    if (gate.state === 'allowed') {
      trackEvent('tribe_os_programs_viewed');
      fetchPrograms();
    }
  }, [gate.state, fetchPrograms]);

  const filtered = useMemo(() => {
    let rows = programs;
    if (tab !== 'all') rows = rows.filter((r) => r.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.sport && r.sport.toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [programs, tab, search]);

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-tribe-dark-80 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirecting : s.loading}...
        </p>
      </main>
    );
  }

  const tabs: TabFilter[] = ['all', ...PROGRAM_STATUSES];

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-tribe-dark">{s.pageTitle}</h1>
            <p className="text-sm text-tribe-dark-80 mt-0.5">{s.subtitle}</p>
          </div>
          <Link href="/os/programs/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              {s.addProgram}
            </Button>
          </Link>
        </div>

        {/* Tabs + search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-tribe text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                  tab === t
                    ? 'bg-tribe-blue text-white'
                    : 'bg-white text-tribe-dark-80 hover:bg-tribe-blue/10'
                }`}
              >
                {s.tab[t]}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-tribe-dark-80" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={s.searchPlaceholder}
              className="w-full pl-8 pr-3 py-1.5 rounded-tribe border border-tribe-dark/10 text-sm focus:outline-none focus:ring-2 focus:ring-tribe-blue/30"
            />
          </div>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-tribe-dark-80 text-sm py-12 text-center">
            {s.loading}...
          </p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Dumbbell className="h-10 w-10 text-tribe-dark/20 mx-auto mb-3" />
            <p className="text-tribe-dark-80 text-sm">
              {programs.length === 0 ? s.empty : s.noMatch}
            </p>
            {programs.length === 0 && (
              <p className="text-tribe-dark-80/60 text-xs mt-1">{s.emptyHint}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => (
              <Link key={p.id} href={`/os/programs/${p.id}`}>
                <div className="bg-white rounded-tribe shadow-tribe px-4 py-3 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-tribe-dark truncate">{p.name}</span>
                      <Badge color={STATUS_COLORS[p.status]}>{s.tab[p.status]}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-tribe-dark-80">
                      {p.sport && <span>{p.sport}</span>}
                      {p.target_sessions_per_week && (
                        <span>{p.target_sessions_per_week} {s.sessions}</span>
                      )}
                      {p.starts_at && (
                        <span>
                          {formatShortDateBi(p.starts_at, language)}
                          {p.ends_at ? ` – ${formatShortDateBi(p.ends_at, language)}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
