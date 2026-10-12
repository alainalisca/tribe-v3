'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Phone, Mail, Clock, MessageCircle, PhoneCall, Users, FileText } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { showError, showSuccess } from '@/lib/toast';
import { Badge, Button } from '@/components/tribe-os/ui';
import { nextStatusOptions } from '@/lib/tribe-os/leads/helpers';
import {
  LEAD_ACTIVITY_KINDS,
  ACTIVITY_BODY_MAX,
  LOST_REASON_PRESETS,
  LOST_REASON_MAX,
} from '@/lib/tribe-os/leads/constants';
import type { LeadStatus, LeadActivityKind } from '@/lib/tribe-os/leads/constants';

const STATUS_COLORS: Record<LeadStatus, 'info' | 'success' | 'warning' | 'danger' | 'default'> = {
  new: 'info',
  contacted: 'warning',
  trial_booked: 'warning',
  trial_done: 'success',
  joined: 'success',
  lost: 'danger',
};

const ACTIVITY_ICONS: Record<string, typeof FileText> = {
  note: FileText,
  whatsapp: MessageCircle,
  call: PhoneCall,
  in_person: Users,
  status_change: Clock,
};

const copy = {
  en: {
    loading: 'Loading',
    redirecting: 'Redirecting',
    back: 'Back to leads',
    source: 'Source',
    phone: 'Phone',
    email: 'Email',
    interest: 'Interest',
    created: 'Created',
    followUp: 'Next follow-up',
    status: 'Status',
    statusLabels: {
      new: 'New',
      contacted: 'Contacted',
      trial_booked: 'Trial Booked',
      trial_done: 'Trial Done',
      joined: 'Joined',
      lost: 'Lost',
    },
    sourceLabels: {
      walk_in: 'Walk-in',
      instagram: 'Instagram',
      whatsapp: 'WhatsApp',
      referral: 'Referral',
      tribe_app: 'Tribe App',
      website: 'Website',
      other: 'Other',
    },
    moveToStatus: 'Move to',
    lostReasonTitle: 'Reason for losing this lead',
    lostReasonPlaceholder: 'Why was this lead lost?',
    conversionTitle: 'Convert to member',
    conversionClientId: 'Client ID (from members list)',
    conversionPlaceholder: 'Paste client UUID',
    confirm: 'Confirm',
    cancel: 'Cancel',
    activities: 'Activity',
    noActivities: 'No activity yet. Log the first interaction.',
    addActivity: 'Log activity',
    activityKind: 'Type',
    activityBody: 'Note',
    activityBodyPlaceholder: 'What happened?',
    save: 'Save',
    saving: 'Saving…',
    kindLabels: {
      note: 'Note',
      whatsapp: 'WhatsApp',
      call: 'Call',
      in_person: 'In person',
      status_change: 'Status change',
    },
    errorLoad: 'No se pudo cargar el lead.',
    errorUpdate: 'No se pudo actualizar. Intenta de nuevo.',
    errorActivity: 'No se pudo guardar la actividad. Intenta de nuevo.',
    successUpdate: 'Lead actualizado',
    successActivity: 'Actividad registrada',
    statusChanged: (from: string, to: string) => `${from} → ${to}`,
  },
  es: {
    loading: 'Cargando',
    redirecting: 'Redirigiendo',
    back: 'Volver a leads',
    source: 'Fuente',
    phone: 'Teléfono',
    email: 'Correo',
    interest: 'Interés',
    created: 'Creado',
    followUp: 'Próximo seguimiento',
    status: 'Estado',
    statusLabels: {
      new: 'Nuevo',
      contacted: 'Contactado',
      trial_booked: 'Prueba agendada',
      trial_done: 'Prueba hecha',
      joined: 'Inscrito',
      lost: 'Perdido',
    },
    sourceLabels: {
      walk_in: 'Walk-in',
      instagram: 'Instagram',
      whatsapp: 'WhatsApp',
      referral: 'Referido',
      tribe_app: 'Tribe App',
      website: 'Sitio web',
      other: 'Otro',
    },
    moveToStatus: 'Mover a',
    lostReasonTitle: 'Razón de pérdida de este lead',
    lostReasonPlaceholder: '¿Por qué se perdió este lead?',
    conversionTitle: 'Convertir a miembro',
    conversionClientId: 'ID del cliente (de la lista de miembros)',
    conversionPlaceholder: 'Pega el UUID del cliente',
    confirm: 'Confirmar',
    cancel: 'Cancelar',
    activities: 'Actividad',
    noActivities: 'Sin actividad aún. Registra la primera interacción.',
    addActivity: 'Registrar actividad',
    activityKind: 'Tipo',
    activityBody: 'Nota',
    activityBodyPlaceholder: '¿Qué pasó?',
    save: 'Guardar',
    saving: 'Guardando…',
    kindLabels: {
      note: 'Nota',
      whatsapp: 'WhatsApp',
      call: 'Llamada',
      in_person: 'En persona',
      status_change: 'Cambio de estado',
    },
    errorLoad: 'No se pudo cargar el lead.',
    errorUpdate: 'No se pudo actualizar. Intenta de nuevo.',
    errorActivity: 'No se pudo guardar la actividad. Intenta de nuevo.',
    successUpdate: 'Lead actualizado',
    successActivity: 'Actividad registrada',
    statusChanged: (from: string, to: string) => `${from} → ${to}`,
  },
} as const;

interface LeadDetail {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: string;
  status: string;
  interest: string | null;
  lost_reason: string | null;
  trial_at: string | null;
  next_follow_up_at: string | null;
  assigned_to: string | null;
  converted_client_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Activity {
  id: string;
  kind: string;
  body: string | null;
  from_status: string | null;
  to_status: string | null;
  created_by: string | null;
  created_at: string;
}

export default function LeadDetailPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [showJoinedModal, setShowJoinedModal] = useState(false);
  const [convertedClientId, setConvertedClientId] = useState('');

  const [showAddActivity, setShowAddActivity] = useState(false);
  const [actKind, setActKind] = useState<LeadActivityKind>('note');
  const [actBody, setActBody] = useState('');

  const fetchLead = useCallback(async () => {
    setLoading(true);
    try {
      const [leadRes, actRes] = await Promise.all([
        fetch(`/api/tribe-os/leads/${leadId}`),
        fetch(`/api/tribe-os/leads/${leadId}/activities`),
      ]);
      const leadJson = await leadRes.json();
      const actJson = await actRes.json();
      if (leadJson.success) setLead(leadJson.data);
      else showError(s.errorLoad);
      if (actJson.success) setActivities(actJson.data);
    } catch {
      showError(s.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [leadId, s.errorLoad]);

  useEffect(() => {
    if (gate.state === 'allowed') {
      trackEvent('tribe_os_lead_detail_viewed');
      fetchLead();
    }
  }, [gate.state, fetchLead]);

  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (newStatus === 'lost') {
      setShowLostModal(true);
      return;
    }
    if (newStatus === 'joined') {
      setShowJoinedModal(true);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/tribe-os/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_lead_status_changed');
        showSuccess(s.successUpdate);
        await fetchLead();
      } else {
        showError(s.errorUpdate);
      }
    } catch {
      showError(s.errorUpdate);
    } finally {
      setBusy(false);
    }
  };

  const handleLostConfirm = async () => {
    if (!lostReason.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tribe-os/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'lost', lost_reason: lostReason.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_lead_lost');
        showSuccess(s.successUpdate);
        setShowLostModal(false);
        setLostReason('');
        await fetchLead();
      } else {
        showError(s.errorUpdate);
      }
    } catch {
      showError(s.errorUpdate);
    } finally {
      setBusy(false);
    }
  };

  const handleJoinedConfirm = async () => {
    if (!convertedClientId.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tribe-os/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'joined', converted_client_id: convertedClientId.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_lead_converted');
        showSuccess(s.successUpdate);
        setShowJoinedModal(false);
        setConvertedClientId('');
        await fetchLead();
      } else {
        showError(s.errorUpdate);
      }
    } catch {
      showError(s.errorUpdate);
    } finally {
      setBusy(false);
    }
  };

  const handleAddActivity = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tribe-os/leads/${leadId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: actKind, body: actBody.trim() || null }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_lead_activity_added');
        showSuccess(s.successActivity);
        setShowAddActivity(false);
        setActKind('note');
        setActBody('');
        await fetchLead();
      } else {
        showError(s.errorActivity);
      }
    } catch {
      showError(s.errorActivity);
    } finally {
      setBusy(false);
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
      <div className="px-4 lg:px-8 py-6">
        <p className="text-tribe-dark-80 text-sm py-12 text-center">{s.loading}...</p>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="px-4 lg:px-8 py-6">
        <Link href="/os/leads" className="text-sm text-tribe-dark-80 hover:text-tribe-dark flex items-center gap-1 mb-4">
          <ArrowLeft className="h-4 w-4" /> {s.back}
        </Link>
        <p className="text-sm text-red-600">{s.errorLoad}</p>
      </div>
    );
  }

  const currentStatus = lead.status as LeadStatus;
  const nextOptions = nextStatusOptions(currentStatus);
  const usableActivityKinds = LEAD_ACTIVITY_KINDS.filter((k) => k !== 'status_change');
  const locale = language === 'es' ? 'es-CO' : 'en-US';

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <Link href="/os/leads" className="text-sm text-tribe-dark-80 hover:text-tribe-dark flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> {s.back}
        </Link>

        {/* Lead Header */}
        <div className="bg-white rounded-tribe shadow-tribe px-5 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight text-tribe-dark">{lead.full_name}</h1>
            <Badge variant={STATUS_COLORS[currentStatus] ?? 'default'}>
              {s.statusLabels[currentStatus] ?? currentStatus}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2 text-tribe-dark-80">
              <span className="font-medium text-tribe-dark">{s.source}:</span>
              {s.sourceLabels[lead.source as keyof typeof s.sourceLabels] ?? lead.source}
            </div>
            {lead.phone && (
              <div className="flex items-center gap-2 text-tribe-dark-80">
                <Phone className="h-4 w-4" />
                {lead.phone}
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2 text-tribe-dark-80">
                <Mail className="h-4 w-4" />
                {lead.email}
              </div>
            )}
            {lead.interest && (
              <div className="text-tribe-dark-80">
                <span className="font-medium text-tribe-dark">{s.interest}:</span> {lead.interest}
              </div>
            )}
            <div className="text-tribe-dark-80">
              <span className="font-medium text-tribe-dark">{s.created}:</span>{' '}
              {new Date(lead.created_at).toLocaleDateString(locale)}
            </div>
            {lead.next_follow_up_at && (
              <div className="flex items-center gap-2 text-tribe-dark-80">
                <Clock className="h-4 w-4" />
                <span className="font-medium text-tribe-dark">{s.followUp}:</span>{' '}
                {new Date(lead.next_follow_up_at).toLocaleDateString(locale)}
              </div>
            )}
          </div>

          {lead.lost_reason && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-tribe">
              {lead.lost_reason}
            </p>
          )}

          {/* Status Actions */}
          {nextOptions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="text-xs font-medium text-tribe-dark-80">{s.moveToStatus}:</span>
              {nextOptions.map((ns) => (
                <button
                  key={ns}
                  type="button"
                  onClick={() => handleStatusChange(ns)}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs font-medium rounded-tribe bg-tribe-green-50 hover:bg-tribe-green text-tribe-green-dark transition-colors disabled:opacity-40"
                >
                  {s.statusLabels[ns]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Activities */}
        <div className="bg-white rounded-tribe shadow-tribe px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-tribe-dark">{s.activities}</h2>
            <Button onClick={() => setShowAddActivity(true)} size="sm" variant="secondary">
              {s.addActivity}
            </Button>
          </div>

          {activities.length === 0 ? (
            <p className="text-sm text-tribe-dark-80 py-4 text-center">{s.noActivities}</p>
          ) : (
            <div className="space-y-2">
              {activities.map((act) => {
                const IconComp = ACTIVITY_ICONS[act.kind] ?? FileText;
                return (
                  <div key={act.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                    <div className="shrink-0 mt-0.5">
                      <IconComp className="h-4 w-4 text-tribe-dark-80" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-tribe-dark-80">
                        <span className="font-medium text-tribe-dark">
                          {s.kindLabels[act.kind as keyof typeof s.kindLabels] ?? act.kind}
                        </span>
                        <span>{new Date(act.created_at).toLocaleString(locale)}</span>
                      </div>
                      {act.kind === 'status_change' && act.from_status && act.to_status && (
                        <p className="text-sm text-tribe-dark mt-0.5">
                          {s.statusChanged(
                            s.statusLabels[act.from_status as LeadStatus] ?? act.from_status,
                            s.statusLabels[act.to_status as LeadStatus] ?? act.to_status,
                          )}
                        </p>
                      )}
                      {act.body && <p className="text-sm text-tribe-dark mt-0.5">{act.body}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Activity Modal */}
      {showAddActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-tribe shadow-lg max-w-md w-full p-5 space-y-4">
            <h3 className="font-bold text-tribe-dark">{s.addActivity}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-tribe-dark-80 block mb-1">{s.activityKind}</label>
                <select
                  value={actKind}
                  onChange={(e) => setActKind(e.target.value as LeadActivityKind)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40"
                >
                  {usableActivityKinds.map((k) => (
                    <option key={k} value={k}>
                      {s.kindLabels[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-tribe-dark-80 block mb-1">{s.activityBody}</label>
                <textarea
                  value={actBody}
                  onChange={(e) => setActBody(e.target.value)}
                  maxLength={ACTIVITY_BODY_MAX}
                  placeholder={s.activityBodyPlaceholder}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowAddActivity(false); setActBody(''); }}
                className="px-4 py-2 text-sm font-medium text-tribe-dark-80 hover:bg-gray-100 rounded-tribe transition-colors"
              >
                {s.cancel}
              </button>
              <Button onClick={handleAddActivity} loading={busy} disabled={busy} size="sm">
                {busy ? s.saving : s.save}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Reason Modal */}
      {showLostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-tribe shadow-lg max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-tribe-dark">{s.lostReasonTitle}</h3>
            <div className="flex flex-wrap gap-1.5">
              {LOST_REASON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLostReason(preset)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    lostReason === preset
                      ? 'bg-tribe-green text-tribe-dark'
                      : 'bg-gray-100 text-tribe-dark-80 hover:bg-gray-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              maxLength={LOST_REASON_MAX}
              placeholder={s.lostReasonPlaceholder}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowLostModal(false); setLostReason(''); }}
                className="px-4 py-2 text-sm font-medium text-tribe-dark-80 hover:bg-gray-100 rounded-tribe transition-colors"
              >
                {s.cancel}
              </button>
              <Button onClick={handleLostConfirm} loading={busy} disabled={!lostReason.trim() || busy} size="sm">
                {busy ? s.saving : s.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Joined / Convert Modal */}
      {showJoinedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-tribe shadow-lg max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-tribe-dark">{s.conversionTitle}</h3>
            <div>
              <label className="text-xs font-medium text-tribe-dark-80 block mb-1">{s.conversionClientId}</label>
              <input
                type="text"
                value={convertedClientId}
                onChange={(e) => setConvertedClientId(e.target.value)}
                placeholder={s.conversionPlaceholder}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowJoinedModal(false); setConvertedClientId(''); }}
                className="px-4 py-2 text-sm font-medium text-tribe-dark-80 hover:bg-gray-100 rounded-tribe transition-colors"
              >
                {s.cancel}
              </button>
              <Button onClick={handleJoinedConfirm} loading={busy} disabled={!convertedClientId.trim() || busy} size="sm">
                {busy ? s.saving : s.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
