'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Phone,
  Mail,
  Clock,
  MessageCircle,
  PhoneCall,
  Users,
  FileText,
  Calendar,
} from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { showError, showSuccess } from '@/lib/toast';
import { Badge, Button } from '@/components/tribe-os/ui';
import { nextStatusOptions } from '@/lib/tribe-os/leads/helpers';
import { formatShortDateBi, formatDateTimeBi } from '@/lib/tribe-os/dates';
import {
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

const ACTION_LABELS = {
  en: {
    contacted: 'Contacted',
    trial_booked: 'Book trial',
    trial_done: 'Trial done',
    joined: 'Signed up',
    lost: 'Lost',
  } as Record<string, string>,
  es: {
    contacted: 'Contactado',
    trial_booked: 'Agendar prueba',
    trial_done: 'Prueba hecha',
    joined: 'Se inscribió',
    lost: 'Perdido',
  } as Record<string, string>,
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
    trial: 'Trial class',
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
    whatsapp: 'WhatsApp',
    llamar: 'Call',
    lostReasonTitle: 'Reason for losing this lead',
    lostReasonPlaceholder: 'Why was this lead lost?',
    conversionTitle: 'Convert to member',
    conversionExisting: 'An existing member was found with this phone:',
    conversionNew: 'A new member will be created:',
    conversionNoPhone: 'This lead has no phone number. A new member record will be created.',
    confirm: 'Confirm',
    cancel: 'Cancel',
    activities: 'Activity',
    noActivities: 'No activity yet. Log the first interaction.',
    quickLogWhatsApp: 'WhatsApp',
    quickLogCall: 'Call',
    quickLogInPerson: 'In person',
    quickLogNote: 'Note',
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
    by: 'by',
    errorLoad: 'No se pudo cargar el lead.',
    errorUpdate: 'No se pudo actualizar. Intenta de nuevo.',
    errorActivity: 'No se pudo guardar la actividad. Intenta de nuevo.',
    successUpdate: 'Lead actualizado',
    successActivity: 'Actividad registrada',
    statusChanged: (from: string, to: string) => `${from} → ${to}`,
    moveToContacted: 'Move to Contacted?',
    yes: 'Yes',
    no: 'No',
    trialDate: 'Trial date & time',
    trialDefault: 'Default: tomorrow at 6:00 PM (Bogota)',
    bookTrial: 'Book trial',
    converting: 'Converting…',
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
    trial: 'Clase de prueba',
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
    whatsapp: 'WhatsApp',
    llamar: 'Llamar',
    lostReasonTitle: 'Razón de pérdida de este lead',
    lostReasonPlaceholder: '¿Por qué se perdió este lead?',
    conversionTitle: 'Convertir a miembro',
    conversionExisting: 'Se encontró un miembro existente con este teléfono:',
    conversionNew: 'Se creará un nuevo miembro:',
    conversionNoPhone: 'Este lead no tiene teléfono. Se creará un nuevo registro de miembro.',
    confirm: 'Confirmar',
    cancel: 'Cancelar',
    activities: 'Actividad',
    noActivities: 'Sin actividad aún. Registra la primera interacción.',
    quickLogWhatsApp: 'WhatsApp',
    quickLogCall: 'Llamada',
    quickLogInPerson: 'En persona',
    quickLogNote: 'Nota',
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
    by: 'por',
    errorLoad: 'No se pudo cargar el lead.',
    errorUpdate: 'No se pudo actualizar. Intenta de nuevo.',
    errorActivity: 'No se pudo guardar la actividad. Intenta de nuevo.',
    successUpdate: 'Lead actualizado',
    successActivity: 'Actividad registrada',
    statusChanged: (from: string, to: string) => `${from} → ${to}`,
    moveToContacted: '¿Mover a Contactado?',
    yes: 'Sí',
    no: 'No',
    trialDate: 'Fecha y hora de prueba',
    trialDefault: 'Por defecto: mañana a las 6:00 p. m. (Bogotá)',
    bookTrial: 'Agendar prueba',
    converting: 'Convirtiendo…',
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
  created_by_name: string | null;
  created_at: string;
}

interface ConversionPreview {
  lead_name: string;
  lead_phone: string | null;
  lead_email: string | null;
  existing_client: { id: string; name: string } | null;
}

function getDefaultTrialAt(): string {
  const now = new Date();
  const bogota = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const tomorrow = new Date(bogota);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(18, 0, 0, 0);
  const offset = -5 * 60;
  const utc = new Date(tomorrow.getTime() - offset * 60 * 1000);
  return utc.toISOString();
}

function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  const bogota = new Date(d.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const y = bogota.getFullYear();
  const m = String(bogota.getMonth() + 1).padStart(2, '0');
  const day = String(bogota.getDate()).padStart(2, '0');
  const h = String(bogota.getHours()).padStart(2, '0');
  const min = String(bogota.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function fromLocalDatetimeValue(localStr: string): string {
  const [datePart, timePart] = localStr.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min] = timePart.split(':').map(Number);
  const bogotaMs = new Date(y, m - 1, d, h, min, 0, 0).getTime();
  const offset = -5 * 60;
  const utc = new Date(bogotaMs - offset * 60 * 1000);
  return utc.toISOString();
}

function phoneDigits(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

export default function LeadDetailPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const actionLabels = ACTION_LABELS[language];
  const gate = useTribeOSPremiumGate();
  const params = useParams();
  const leadId = params.id as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState('');

  const [showJoinedModal, setShowJoinedModal] = useState(false);
  const [conversionPreview, setConversionPreview] = useState<ConversionPreview | null>(null);
  const [conversionLoading, setConversionLoading] = useState(false);

  const [showTrialModal, setShowTrialModal] = useState(false);
  const [trialAtLocal, setTrialAtLocal] = useState(() => toLocalDatetimeValue(getDefaultTrialAt()));

  const [quickLogKind, setQuickLogKind] = useState<LeadActivityKind | null>(null);
  const [quickLogBody, setQuickLogBody] = useState('');
  const [offerContacted, setOfferContacted] = useState(false);

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
      setConversionLoading(true);
      setShowJoinedModal(true);
      try {
        const res = await fetch(`/api/tribe-os/leads/${leadId}?preview=conversion`);
        const json = await res.json();
        if (json.success) {
          setConversionPreview(json.data);
        } else {
          showError(s.errorLoad);
          setShowJoinedModal(false);
        }
      } catch {
        showError(s.errorLoad);
        setShowJoinedModal(false);
      } finally {
        setConversionLoading(false);
      }
      return;
    }
    if (newStatus === 'trial_booked') {
      setTrialAtLocal(toLocalDatetimeValue(getDefaultTrialAt()));
      setShowTrialModal(true);
      return;
    }
    await doStatusChange(newStatus);
  };

  const doStatusChange = async (newStatus: LeadStatus, extra?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tribe-os/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, ...extra }),
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

  const handleTrialConfirm = async () => {
    const iso = fromLocalDatetimeValue(trialAtLocal);
    await doStatusChange('trial_booked', { trial_at: iso });
    setShowTrialModal(false);
  };

  const handleLostConfirm = async () => {
    if (!lostReason.trim()) return;
    await doStatusChange('lost', { lost_reason: lostReason.trim() });
    setShowLostModal(false);
    setLostReason('');
  };

  const handleJoinedConfirm = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tribe-os/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'joined' }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_lead_converted');
        showSuccess(s.successUpdate);
        setShowJoinedModal(false);
        setConversionPreview(null);
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

  const handleQuickLog = async (kind: LeadActivityKind) => {
    setQuickLogKind(kind);
    setQuickLogBody('');
    setOfferContacted(false);
  };

  const submitQuickLog = async () => {
    if (!quickLogKind) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tribe-os/leads/${leadId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: quickLogKind, body: quickLogBody.trim() || null }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_lead_activity_added');
        showSuccess(s.successActivity);
        if (lead && lead.status === 'new') {
          setOfferContacted(true);
        } else {
          setQuickLogKind(null);
          setQuickLogBody('');
        }
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

  const handleAcceptContacted = async () => {
    setOfferContacted(false);
    setQuickLogKind(null);
    setQuickLogBody('');
    await doStatusChange('contacted');
  };

  const handleDeclineContacted = () => {
    setOfferContacted(false);
    setQuickLogKind(null);
    setQuickLogBody('');
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
  const waDigits = lead.phone ? phoneDigits(lead.phone) : null;

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
                <span>{lead.phone}</span>
                <div className="flex items-center gap-1.5 ml-1">
                  {waDigits && (
                    <a
                      href={`https://wa.me/${waDigits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                    >
                      <MessageCircle className="h-3 w-3" />
                      {s.whatsapp}
                    </a>
                  )}
                  <a
                    href={`tel:${lead.phone}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                  >
                    <PhoneCall className="h-3 w-3" />
                    {s.llamar}
                  </a>
                </div>
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
              {formatShortDateBi(lead.created_at, language)}
            </div>
            {lead.trial_at && (
              <div className="flex items-center gap-2 text-tribe-dark-80">
                <Calendar className="h-4 w-4" />
                <span className="font-medium text-tribe-dark">{s.trial}:</span>{' '}
                {formatDateTimeBi(lead.trial_at, language)}
              </div>
            )}
            {lead.next_follow_up_at && (
              <div className="flex items-center gap-2 text-tribe-dark-80">
                <Clock className="h-4 w-4" />
                <span className="font-medium text-tribe-dark">{s.followUp}:</span>{' '}
                {formatShortDateBi(lead.next_follow_up_at, language)}
              </div>
            )}
          </div>

          {lead.lost_reason && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-tribe">
              {lead.lost_reason}
            </p>
          )}

          {/* Status Action Buttons */}
          {nextOptions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {nextOptions.map((ns) => (
                <button
                  key={ns}
                  type="button"
                  onClick={() => handleStatusChange(ns)}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs font-medium rounded-tribe bg-tribe-green-50 hover:bg-tribe-green text-tribe-green-dark transition-colors disabled:opacity-40"
                >
                  {actionLabels[ns] ?? ns}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick Log Buttons */}
        <div className="bg-white rounded-tribe shadow-tribe px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-tribe-dark">{s.activities}</h2>
          </div>

          {/* Quick log row */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              ['whatsapp', s.quickLogWhatsApp, MessageCircle],
              ['call', s.quickLogCall, PhoneCall],
              ['in_person', s.quickLogInPerson, Users],
              ['note', s.quickLogNote, FileText],
            ] as const).map(([kind, label, Icon]) => (
              <button
                key={kind}
                type="button"
                onClick={() => handleQuickLog(kind as LeadActivityKind)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-tribe bg-gray-100 hover:bg-gray-200 text-tribe-dark transition-colors"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Quick log form */}
          {quickLogKind && !offerContacted && (
            <div className="border border-gray-200 rounded-tribe p-3 space-y-2">
              <textarea
                value={quickLogBody}
                onChange={(e) => setQuickLogBody(e.target.value)}
                maxLength={ACTIVITY_BODY_MAX}
                placeholder={s.activityBodyPlaceholder}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40 resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setQuickLogKind(null); setQuickLogBody(''); }}
                  className="px-3 py-1.5 text-xs font-medium text-tribe-dark-80 hover:bg-gray-100 rounded-tribe transition-colors"
                >
                  {s.cancel}
                </button>
                <Button onClick={submitQuickLog} loading={busy} disabled={busy} size="sm">
                  {busy ? s.saving : s.save}
                </Button>
              </div>
            </div>
          )}

          {/* Auto-status offer for "new" leads after logging */}
          {offerContacted && (
            <div className="border border-tribe-green/30 bg-tribe-green-50 rounded-tribe p-3 flex items-center justify-between gap-3">
              <span className="text-sm text-tribe-dark">{s.moveToContacted}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAcceptContacted}
                  className="px-3 py-1.5 text-xs font-bold rounded-tribe bg-tribe-green text-tribe-dark hover:shadow-tribe transition-shadow"
                >
                  {s.yes}
                </button>
                <button
                  type="button"
                  onClick={handleDeclineContacted}
                  className="px-3 py-1.5 text-xs font-medium text-tribe-dark-80 hover:bg-gray-100 rounded-tribe transition-colors"
                >
                  {s.no}
                </button>
              </div>
            </div>
          )}

          {/* Timeline */}
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
                      <div className="flex items-center gap-2 text-xs text-tribe-dark-80 flex-wrap">
                        <span className="font-medium text-tribe-dark">
                          {s.kindLabels[act.kind as keyof typeof s.kindLabels] ?? act.kind}
                        </span>
                        <span>{formatDateTimeBi(act.created_at, language)}</span>
                        {act.created_by_name && (
                          <span>{s.by} {act.created_by_name}</span>
                        )}
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

      {/* Trial Date Modal */}
      {showTrialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-tribe shadow-lg max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-tribe-dark">{s.bookTrial}</h3>
            <div>
              <label className="text-xs font-medium text-tribe-dark-80 block mb-1">{s.trialDate}</label>
              <input
                type="datetime-local"
                value={trialAtLocal}
                onChange={(e) => setTrialAtLocal(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/40"
              />
              <p className="text-[10px] text-tribe-dark-80 mt-1">{s.trialDefault}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTrialModal(false)}
                className="px-4 py-2 text-sm font-medium text-tribe-dark-80 hover:bg-gray-100 rounded-tribe transition-colors"
              >
                {s.cancel}
              </button>
              <Button onClick={handleTrialConfirm} loading={busy} disabled={!trialAtLocal || busy} size="sm">
                {busy ? s.saving : s.confirm}
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

      {/* Conversion Preview Modal */}
      {showJoinedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-tribe shadow-lg max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-tribe-dark">{s.conversionTitle}</h3>
            {conversionLoading ? (
              <p className="text-sm text-tribe-dark-80 text-center py-4">{s.loading}...</p>
            ) : conversionPreview ? (
              <div className="space-y-2 text-sm">
                {conversionPreview.existing_client ? (
                  <>
                    <p className="text-tribe-dark-80">{s.conversionExisting}</p>
                    <div className="bg-green-50 border border-green-200 rounded-tribe px-3 py-2">
                      <p className="font-semibold text-tribe-dark">{conversionPreview.existing_client.name}</p>
                      {conversionPreview.lead_phone && (
                        <p className="text-xs text-tribe-dark-80">{conversionPreview.lead_phone}</p>
                      )}
                    </div>
                  </>
                ) : conversionPreview.lead_phone ? (
                  <>
                    <p className="text-tribe-dark-80">{s.conversionNew}</p>
                    <div className="bg-blue-50 border border-blue-200 rounded-tribe px-3 py-2">
                      <p className="font-semibold text-tribe-dark">{conversionPreview.lead_name}</p>
                      <p className="text-xs text-tribe-dark-80">{conversionPreview.lead_phone}</p>
                      {conversionPreview.lead_email && (
                        <p className="text-xs text-tribe-dark-80">{conversionPreview.lead_email}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-tribe-dark-80">{s.conversionNoPhone}</p>
                    <div className="bg-blue-50 border border-blue-200 rounded-tribe px-3 py-2">
                      <p className="font-semibold text-tribe-dark">{conversionPreview.lead_name}</p>
                      {conversionPreview.lead_email && (
                        <p className="text-xs text-tribe-dark-80">{conversionPreview.lead_email}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowJoinedModal(false); setConversionPreview(null); }}
                className="px-4 py-2 text-sm font-medium text-tribe-dark-80 hover:bg-gray-100 rounded-tribe transition-colors"
              >
                {s.cancel}
              </button>
              <Button
                onClick={handleJoinedConfirm}
                loading={busy}
                disabled={conversionLoading || busy}
                size="sm"
              >
                {busy ? s.converting : s.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
