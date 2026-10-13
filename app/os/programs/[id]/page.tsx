'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Search, UserMinus } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { showError, showSuccess } from '@/lib/toast';
import { Badge, Button } from '@/components/tribe-os/ui';
import { formatShortDateBi } from '@/lib/tribe-os/dates';
import { progressLabel } from '@/lib/tribe-os/programs/progress';
import type { MemberProgress } from '@/lib/tribe-os/programs/progress';
import type { ProgramStatus } from '@/lib/tribe-os/programs/constants';

const STATUS_COLORS: Record<ProgramStatus, 'info' | 'success' | 'warning' | 'danger' | 'default'> = {
  draft: 'default',
  active: 'success',
  archived: 'warning',
};

const copy = {
  en: {
    loading: 'Loading',
    redirecting: 'Redirecting',
    back: 'Programs',
    notFound: 'Program not found',
    members: 'Members',
    noMembers: 'No members assigned yet.',
    addMember: 'Add Member',
    searchMembers: 'Search members to add…',
    remove: 'Remove',
    visits: 'visits',
    expected: 'expected',
    errorLoad: 'Could not load program.',
    errorMembers: 'Could not load members.',
    errorAssign: 'Could not assign member.',
    errorRemove: 'Could not remove member.',
    successAssign: 'Member assigned',
    successRemove: 'Member removed',
    alreadyAssigned: 'Already assigned to this program.',
    sessions: 'sessions/week',
    statusLabels: { draft: 'Draft', active: 'Active', archived: 'Archived' } as Record<string, string>,
    sport: 'Sport',
    dates: 'Dates',
    target: 'Target',
    description: 'Description',
  },
  es: {
    loading: 'Cargando',
    redirecting: 'Redirigiendo',
    back: 'Programas',
    notFound: 'Programa no encontrado',
    members: 'Miembros',
    noMembers: 'Sin miembros asignados aún.',
    addMember: 'Agregar miembro',
    searchMembers: 'Buscar miembros para agregar…',
    remove: 'Quitar',
    visits: 'visitas',
    expected: 'esperadas',
    errorLoad: 'No se pudo cargar el programa.',
    errorMembers: 'No se pudo cargar los miembros.',
    errorAssign: 'No se pudo asignar el miembro.',
    errorRemove: 'No se pudo quitar el miembro.',
    successAssign: 'Miembro asignado',
    successRemove: 'Miembro quitado',
    alreadyAssigned: 'Ya está asignado a este programa.',
    sessions: 'sesiones/semana',
    statusLabels: { draft: 'Borrador', active: 'Activo', archived: 'Archivado' } as Record<string, string>,
    sport: 'Deporte',
    dates: 'Fechas',
    target: 'Objetivo',
    description: 'Descripción',
  },
} as const;

interface ProgramData {
  id: string;
  name: string;
  description: string | null;
  sport: string | null;
  status: ProgramStatus;
  starts_at: string | null;
  ends_at: string | null;
  target_sessions_per_week: number | null;
}

interface MemberRow {
  id: string;
  client_id: string;
  client_name: string;
  assigned_at: string;
  visit_count: number;
  progress: MemberProgress | null;
}

interface ClientHit {
  id: string;
  name: string;
}

export default function ProgramDetailPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();
  const { id } = useParams<{ id: string }>();

  const [program, setProgram] = useState<ProgramData | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<ClientHit[]>([]);
  const [assigning, setAssigning] = useState(false);

  const fetchProgram = useCallback(async () => {
    try {
      const res = await fetch(`/api/tribe-os/programs/${id}`);
      const json = await res.json();
      if (json.success) setProgram(json.data);
      else showError(s.errorLoad);
    } catch {
      showError(s.errorLoad);
    }
  }, [id, s.errorLoad]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/tribe-os/programs/${id}/members`);
      const json = await res.json();
      if (json.success) setMembers(json.data);
      else showError(s.errorMembers);
    } catch {
      showError(s.errorMembers);
    }
  }, [id, s.errorMembers]);

  useEffect(() => {
    if (gate.state === 'allowed') {
      trackEvent('tribe_os_program_detail_viewed', { program_id: id });
      Promise.all([fetchProgram(), fetchMembers()]).finally(() => setLoading(false));
    }
  }, [gate.state, id, fetchProgram, fetchMembers]);

  useEffect(() => {
    if (!clientSearch.trim() || clientSearch.length < 2) {
      setClientResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tribe-os/clients?search=${encodeURIComponent(clientSearch)}&limit=5`);
        const json = await res.json();
        if (json.success) {
          setClientResults((json.data ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearch]);

  const handleAssign = async (clientId: string) => {
    setAssigning(true);
    try {
      const res = await fetch(`/api/tribe-os/programs/${id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_program_member_assigned', { program_id: id });
        showSuccess(s.successAssign);
        setShowAdd(false);
        setClientSearch('');
        setClientResults([]);
        await fetchMembers();
      } else {
        showError(json.error === 'already_assigned' ? s.alreadyAssigned : s.errorAssign);
      }
    } catch {
      showError(s.errorAssign);
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      const res = await fetch(`/api/tribe-os/programs/${id}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_program_member_removed', { program_id: id });
        showSuccess(s.successRemove);
        await fetchMembers();
      } else {
        showError(s.errorRemove);
      }
    } catch {
      showError(s.errorRemove);
    }
  };

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-tribe-dark-80 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirecting : s.loading}...
        </p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-tribe-dark-80 text-sm uppercase tracking-[0.1em]">{s.loading}...</p>
      </main>
    );
  }

  if (!program) {
    return (
      <div className="px-4 lg:px-8 py-6">
        <Link href="/os/programs" className="inline-flex items-center gap-1 text-xs text-tribe-blue hover:underline mb-4">
          <ArrowLeft className="h-3 w-3" />
          {s.back}
        </Link>
        <p className="text-tribe-dark-80 text-sm">{s.notFound}</p>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/os/programs" className="inline-flex items-center gap-1 text-xs text-tribe-blue hover:underline">
          <ArrowLeft className="h-3 w-3" />
          {s.back}
        </Link>

        {/* Program header */}
        <div className="bg-white rounded-tribe shadow-tribe px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-xl font-black text-tribe-dark">{program.name}</h1>
            <Badge color={STATUS_COLORS[program.status]}>{s.statusLabels[program.status]}</Badge>
          </div>
          {program.description && (
            <p className="text-sm text-tribe-dark-80 mb-3">{program.description}</p>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-tribe-dark-80">
            {program.sport && (
              <span><span className="font-bold">{s.sport}:</span> {program.sport}</span>
            )}
            {program.target_sessions_per_week && (
              <span><span className="font-bold">{s.target}:</span> {program.target_sessions_per_week} {s.sessions}</span>
            )}
            {program.starts_at && (
              <span>
                <span className="font-bold">{s.dates}:</span>{' '}
                {formatShortDateBi(program.starts_at, language)}
                {program.ends_at ? ` – ${formatShortDateBi(program.ends_at, language)}` : ''}
              </span>
            )}
          </div>
        </div>

        {/* Members */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-black text-tribe-dark">{s.members}</h2>
            <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
              <Plus className="h-4 w-4 mr-1" />
              {s.addMember}
            </Button>
          </div>

          {showAdd && (
            <div className="bg-white rounded-tribe shadow-tribe px-4 py-3 mb-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-tribe-dark-80" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder={s.searchMembers}
                  className="w-full pl-8 pr-3 py-2 rounded-tribe border border-tribe-dark/10 text-sm focus:outline-none focus:ring-2 focus:ring-tribe-blue/30"
                  autoFocus
                />
              </div>
              {clientResults.length > 0 && (
                <div className="mt-2 space-y-1">
                  {clientResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleAssign(c.id)}
                      disabled={assigning}
                      className="w-full text-left px-3 py-1.5 rounded-tribe hover:bg-tribe-blue/5 text-sm text-tribe-dark transition-colors"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {members.length === 0 ? (
            <p className="text-tribe-dark-80 text-sm py-6 text-center">{s.noMembers}</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => {
                const label = progressLabel(m.progress, language);
                return (
                  <div
                    key={m.id}
                    className="bg-white rounded-tribe shadow-tribe px-4 py-3 flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-bold text-tribe-dark">{m.client_name}</span>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-tribe-dark-80">
                        <span>
                          {m.visit_count} {s.visits}
                          {m.progress ? ` / ${m.progress.expectedVisits} ${s.expected}` : ''}
                        </span>
                        {label && (
                          <Badge color={m.progress?.onTrack ? 'success' : 'danger'}>{label}</Badge>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(m.id)}
                      className="text-tribe-dark-80 hover:text-red-600 transition-colors p-1"
                      title={s.remove}
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
