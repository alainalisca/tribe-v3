'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, UserPlus, Phone } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { showError, showSuccess } from '@/lib/toast';
import { Badge, Button } from '@/components/tribe-os/ui';
import { formatShortDateBi, formatDateTimeBi } from '@/lib/tribe-os/dates';
import {
  LEAD_STATUSES,
  LEAD_SOURCES,
  FULL_NAME_MAX,
  INTEREST_MAX,
} from '@/lib/tribe-os/leads/constants';
import type { LeadStatus, LeadSource } from '@/lib/tribe-os/leads/constants';

const STATUS_COLORS: Record<LeadStatus, 'info' | 'success' | 'warning' | 'danger' | 'default'> = {
  new: 'info',
  contacted: 'warning',
  trial_booked: 'warning',
  trial_done: 'success',
  joined: 'success',
  lost: 'danger',
};

const copy = {
  en: {
    pageTitle: 'Leads',
    subtitle: 'Track prospects from first contact to sign-up',
    loading: 'Loading',
    redirecting: 'Redirecting',
    searchPlaceholder: 'Search by name, phone, or email…',
    addLead: 'Add Lead',
    tab: {
      all: 'All',
      new: 'New',
      contacted: 'Contacted',
      trial_booked: 'Trial Booked',
      trial_done: 'Trial Done',
      joined: 'Joined',
      lost: 'Lost',
    },
    empty: 'No leads yet.',
    emptyHint: 'Add your first lead to start tracking prospects.',
    noMatch: 'No leads match these filters.',
    source: 'Source',
    trial: 'Trial',
    quickAdd: 'Quick Add Lead',
    name: 'Full name',
    email: 'Email',
    phone: 'Phone',
    interest: 'Interest',
    referredBy: 'Referred by',
    referredByPlaceholder: 'Search members…',
    assignedTo: 'Assigned to',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    errorCreate: 'No se pudo crear el lead. Intenta de nuevo.',
    errorLoad: 'No se pudo cargar los leads.',
    successCreate: 'Lead creado',
    duplicatePhone: 'Ya existe un lead abierto con ese teléfono.',
    viewExisting: 'Ver lead existente',
    sourceLabels: {
      walk_in: 'Walk-in',
      instagram: 'Instagram',
      whatsapp: 'WhatsApp',
      referral: 'Referral',
      tribe_app: 'Tribe App',
      website: 'Website',
      other: 'Other',
    } as Record<string, string>,
    statsNew30d: 'New (30d)',
    statsActive: 'Active pipeline',
    statsConverted: 'Converted',
    statsLost: 'Lost',
    statsBySource: 'By source',
    statsConvRate: 'conv.',
    statsTrialShowUp: 'Trial show-up',
    owner: 'Owner',
  },
  es: {
    pageTitle: 'Leads',
    subtitle: 'Seguimiento de prospectos desde el primer contacto hasta la inscripción',
    loading: 'Cargando',
    redirecting: 'Redirigiendo',
    searchPlaceholder: 'Buscar por nombre, teléfono o correo…',
    addLead: 'Agregar lead',
    tab: {
      all: 'Todos',
      new: 'Nuevo',
      contacted: 'Contactado',
      trial_booked: 'Prueba agendada',
      trial_done: 'Prueba hecha',
      joined: 'Inscrito',
      lost: 'Perdido',
    },
    empty: 'Sin leads aún.',
    emptyHint: 'Agrega tu primer lead para empezar a hacer seguimiento.',
    noMatch: 'Ningún lead coincide con estos filtros.',
    source: 'Fuente',
    trial: 'Prueba',
    quickAdd: 'Agregar lead rápido',
    name: 'Nombre completo',
    email: 'Correo',
    phone: 'Teléfono',
    interest: 'Interés',
    referredBy: 'Referido por',
    referredByPlaceholder: 'Buscar miembros…',
    assignedTo: 'Asignado a',
    cancel: 'Cancelar',
    save: 'Guardar',
    saving: 'Guardando…',
    errorCreate: 'No se pudo crear el lead. Intenta de nuevo.',
    errorLoad: 'No se pudo cargar los leads.',
    successCreate: 'Lead creado',
    duplicatePhone: 'Ya existe un lead abierto con ese teléfono.',
    viewExisting: 'Ver lead existente',
    sourceLabels: {
      walk_in: 'Walk-in',
      instagram: 'Instagram',
      whatsapp: 'WhatsApp',
      referral: 'Referido',
      tribe_app: 'Tribe App',
      website: 'Sitio web',
      other: 'Otro',
    } as Record<string, string>,
    statsNew30d: 'Nuevos (30d)',
    statsActive: 'Pipeline activo',
    statsConverted: 'Convertidos',
    statsLost: 'Perdidos',
    statsBySource: 'Por fuente',
    statsConvRate: 'conv.',
    statsTrialShowUp: 'Asistencia a prueba',
    owner: 'Dueño',
  },
} as const;

interface LeadRow {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: string;
  status: string;
  interest: string | null;
  trial_at: string | null;
  created_at: string;
  updated_at: string;
}

interface StatsData {
  total: number;
  by_status: Record<string, number>;
  by_source: Record<string, { total: number; joined: number }>;
  trial_reached: number;
  trial_completed: number;
  new_last_30d: number;
}

interface CoachOption {
  user_id: string;
  display_name: string;
}

interface MemberHit {
  id: string;
  name: string;
}

type TabFilter = 'all' | LeadStatus;

export default function LeadsPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dupLeadId, setDupLeadId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formSource, setFormSource] = useState<LeadSource>('walk_in');
  const [formInterest, setFormInterest] = useState('');
  const [formReferredBy, setFormReferredBy] = useState<string | null>(null);
  const [formAssignedTo, setFormAssignedTo] = useState<string | null>(null);

  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<MemberHit[]>([]);
  const [referredByName, setReferredByName] = useState('');

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, statsRes] = await Promise.all([
        fetch('/api/tribe-os/leads'),
        fetch('/api/tribe-os/leads/stats'),
      ]);
      const leadsJson = await leadsRes.json();
      const statsJson = await statsRes.json();
      if (leadsJson.success) setLeads(leadsJson.data);
      else showError(s.errorLoad);
      if (statsJson.success) setStats(statsJson.data);
    } catch {
      showError(s.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [s.errorLoad]);

  useEffect(() => {
    if (gate.state === 'allowed') {
      trackEvent('tribe_os_leads_viewed');
      fetchLeads();
      fetch('/api/tribe-os/coaches')
        .then((r) => r.json())
        .then((json) => {
          if (json.success) {
            const list: CoachOption[] = (json.data?.coaches ?? []).map((c: { user_id: string; display_name?: string; user_name?: string }) => ({
              user_id: c.user_id,
              display_name: c.display_name || c.user_name || 'Coach',
            }));
            setCoaches(list);
          }
        })
        .catch(() => {});
    }
  }, [gate.state, fetchLeads]);

  useEffect(() => {
    if (!memberSearch.trim() || memberSearch.length < 2) {
      setMemberResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tribe-os/clients?search=${encodeURIComponent(memberSearch)}&limit=5`);
        const json = await res.json();
        if (json.success) {
          setMemberResults((json.data ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch]);

  const filtered = useMemo(() => {
    let rows = leads;
    if (tab !== 'all') rows = rows.filter((r) => r.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.full_name.toLowerCase().includes(q) ||
          (r.phone && r.phone.includes(q)) ||
          (r.email && r.email.toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [leads, tab, search]);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    setDupLeadId(null);
    try {
      const res = await fetch('/api/tribe-os/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: formName.trim(),
          source: formSource,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          interest: formInterest.trim() || null,
          referred_by_client_id: formReferredBy,
          assigned_to: formAssignedTo,
        }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_lead_created');
        showSuccess(s.successCreate);
        resetForm();
        await fetchLeads();
      } else {
        if (json.error === 'duplicate_phone') {
          setDupLeadId(json.existing_lead_id ?? null);
          showError(s.duplicatePhone);
        } else {
          showError(s.errorCreate);
        }
      }
    } catch {
      showError(s.errorCreate);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setShowAdd(false);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormSource('walk_in');
    setFormInterest('');
    setFormReferredBy(null);
    setFormAssignedTo(null);
    setReferredByName('');
    setMemberSearch('');
    setMemberResults([]);
    setDupLeadId(null);
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

  const tabs: TabFilter[] = ['all', ...LEAD_STATUSES];
  const activePipeline = stats
    ? (stats.by_status['new'] ?? 0) +
      (stats.by_status['contacted'] ?? 0) +
      (stats.by_status['trial_booked'] ?? 0) +
      (stats.by_status['trial_done'] ?? 0)
    : 0;

  const trialShowUp = stats && stats.trial_reached > 0
    ? Math.round((stats.trial_completed / stats.trial_reached) * 100)
    : null;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Stats */}
        {stats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-tribe shadow-tribe px-4 py-3">
                <p className="text-xs text-tribe-dark-80 uppercase tracking-wider">{s.statsNew30d}</p>
                <p className="text-2xl font-black text-tribe-dark mt-1">{stats.new_last_30d}</p>
              </div>
              <div className="bg-white rounded-tribe shadow-tribe px-4 py-3">
                <p className="text-xs text-tribe-dark-80 uppercase tracking-wider">{s.statsActive}</p>
                <p className="text-2xl font-black text-tribe-dark mt-1">{activePipeline}</p>
              </div>
              <div className="bg-white rounded-tribe shadow-tribe px-4 py-3">
                <p className="text-xs text-tribe-dark-80 uppercase tracking-wider">{s.statsConverted}</p>
                <p className="text-2xl font-black text-tribe-green-dark mt-1">{stats.by_status['joined'] ?? 0}</p>
              </div>
              <div className="bg-white rounded-tribe shadow-tribe px-4 py-3">
                <p className="text-xs text-tribe-dark-80 uppercase tracking-wider">{s.statsLost}</p>
                <p className="text-2xl font-black text-red-600 mt-1">{stats.by_status['lost'] ?? 0}</p>
              </div>
            </div>

            {/* By source + trial show-up */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white rounded-tribe shadow-tribe px-4 py-3">
                <p className="text-xs text-tribe-dark-80 uppercase tracking-wider mb-2">{s.statsBySource}</p>
                <div className="space-y-1">
                  {LEAD_SOURCES.map((src) => {
                    const d = stats.by_source[src];
                    if (!d || d.total === 0) return null;
                    const rate = d.total > 0 ? Math.round((d.joined / d.total) * 100) : 0;
                    return (
                      <div key={src} className="flex items-center justify-between text-xs">
                        <span className="text-tribe-dark">{s.sourceLabels[src] ?? src}</span>
                        <span className="text-tribe-dark-80">
                          {d.total} · {rate}% {s.statsConvRate}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {trialShowUp !== null && (
                <div className="bg-white rounded-tribe shadow-tribe px-4 py-3">
                  <p className="text-xs text-tribe-dark-80 uppercase tracking-wider">{s.statsTrialShowUp}</p>
                  <p className="text-2xl font-black text-tribe-dark mt-1">{trialShowUp}%</p>
                  <p className="text-xs text-tribe-dark-80 mt-0.5">
                    {stats.trial_completed} / {stats.trial_reached}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-tribe-dark">{s.pageTitle}</h1>
            <p className="text-sm text-tribe-dark-80 mt-1">{s.subtitle}</p>
          </div>
          <Button onClick={() => setShowAdd(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            {s.addLead}
          </Button>
        </header>

        {/* Search + Tabs */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-tribe-dark-80" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={s.searchPlaceholder}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  tab === t
                    ? 'bg-tribe-green text-tribe-dark'
                    : 'bg-gray-100 text-tribe-dark-80 hover:bg-gray-200'
                }`}
              >
                {s.tab[t]}
                {stats && t !== 'all' && (
                  <span className="ml-1 opacity-60">{stats.by_status[t] ?? 0}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-tribe-dark-80 text-sm py-12 text-center">{s.loading}...</p>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-tribe shadow-tribe">
            <UserPlus className="h-10 w-10 text-tribe-dark-80 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold text-tribe-dark">
              {leads.length === 0 ? s.empty : s.noMatch}
            </p>
            <p className="text-xs text-tribe-dark-80 mt-1 max-w-xs mx-auto">
              {leads.length === 0 ? s.emptyHint : ''}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((lead) => (
              <Link
                key={lead.id}
                href={`/os/leads/${lead.id}`}
                className="block bg-white rounded-tribe shadow-tribe px-4 py-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-tribe-dark truncate">{lead.full_name}</span>
                      <Badge variant={STATUS_COLORS[lead.status as LeadStatus] ?? 'default'}>
                        {s.tab[lead.status as LeadStatus] ?? lead.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-tribe-dark-80 flex-wrap">
                      <span>{s.source}: {s.sourceLabels[lead.source] ?? lead.source}</span>
                      {lead.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </span>
                      )}
                      {lead.interest && <span>{lead.interest}</span>}
                      {lead.trial_at && (
                        <span>{s.trial}: {formatDateTimeBi(lead.trial_at, language)}</span>
                      )}
                      <span>{formatShortDateBi(lead.created_at, language)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Add Sheet */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-tribe shadow-lg max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-tribe-dark text-lg">{s.quickAdd}</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-tribe-dark-80 block mb-1">{s.name} *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={FULL_NAME_MAX}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-tribe-dark-80 block mb-1">{s.phone}</label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="+57 300 123 4567"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-tribe-dark-80 block mb-1">{s.email}</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-tribe-dark-80 block mb-1">{s.source}</label>
                <select
                  value={formSource}
                  onChange={(e) => setFormSource(e.target.value as LeadSource)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40"
                >
                  {LEAD_SOURCES.map((src) => (
                    <option key={src} value={src}>
                      {s.sourceLabels[src] ?? src}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-tribe-dark-80 block mb-1">{s.interest}</label>
                <input
                  type="text"
                  value={formInterest}
                  onChange={(e) => setFormInterest(e.target.value)}
                  maxLength={INTEREST_MAX}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40"
                />
              </div>
              <div className="relative">
                <label className="text-xs font-medium text-tribe-dark-80 block mb-1">{s.referredBy}</label>
                {referredByName ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-tribe-dark">{referredByName}</span>
                    <button type="button" onClick={() => { setFormReferredBy(null); setReferredByName(''); }} className="text-xs text-red-500">×</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder={s.referredByPlaceholder}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40"
                    />
                    {memberResults.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-tribe shadow-lg max-h-32 overflow-y-auto">
                        {memberResults.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setFormReferredBy(m.id);
                              setReferredByName(m.name);
                              setMemberSearch('');
                              setMemberResults([]);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              {coaches.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-tribe-dark-80 block mb-1">{s.assignedTo}</label>
                  <select
                    value={formAssignedTo ?? ''}
                    onChange={(e) => setFormAssignedTo(e.target.value || null)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40"
                  >
                    <option value="">{s.owner}</option>
                    {coaches.map((c) => (
                      <option key={c.user_id} value={c.user_id}>
                        {c.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {dupLeadId && (
              <div className="bg-amber-50 border border-amber-200 rounded-tribe px-3 py-2 text-sm">
                <p className="text-amber-800">{s.duplicatePhone}</p>
                <Link href={`/os/leads/${dupLeadId}`} className="text-tribe-green-dark font-medium underline text-xs" onClick={resetForm}>
                  {s.viewExisting}
                </Link>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-tribe-dark-80 hover:bg-gray-100 rounded-tribe transition-colors"
              >
                {s.cancel}
              </button>
              <Button onClick={handleCreate} loading={saving} disabled={!formName.trim() || saving} size="sm">
                {saving ? s.saving : s.save}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
