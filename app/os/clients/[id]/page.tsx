'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Mail,
  Phone,
  AlertCircle,
  Calendar,
  CheckCircle,
  DollarSign,
  MessageCircle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { formatCents, formatPaidTotal, formatShortDate } from '@/lib/format/currency';
import { isValidUuid } from '@/lib/validations/uuid';
import { buildWhatsAppUrl } from '@/lib/phone';
import { trackEvent } from '@/lib/analytics';
import RecordAttendanceInline from '@/components/tribe-os/RecordAttendanceInline';
import ChurnRiskPanel from '@/components/tribe-os/ChurnRiskPanel';
import TrainingPartnersSection from '@/components/tribe-os/TrainingPartnersSection';
import InsightHistorySection from '@/components/tribe-os/InsightHistorySection';
import StreakMilestoneChip from '@/components/tribe-os/StreakMilestoneChip';
import AttendanceHeatmap from '@/components/tribe-os/AttendanceHeatmap';
import type { AttendanceWithSession, ClientAttendanceSummary, ClientRow } from '@/lib/dal/clients';

interface DetailResponse {
  client: ClientRow;
  summary: ClientAttendanceSummary;
}

type DetailState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not_found' }
  | { kind: 'ready'; client: ClientRow; summary: ClientAttendanceSummary; attendance: AttendanceWithSession[] };

const copy = {
  en: {
    backToList: 'Back to clients',
    edit: 'Edit',
    delete: 'Delete',
    redirectingLabel: 'Redirecting',
    loading: 'Loading',
    notFoundTitle: 'Client not found',
    notFoundHint: 'This client may have been removed or you do not have access.',
    errorTitle: 'Could not load client',
    retry: 'Retry',

    // Stats
    statsTitle: 'Stats',
    sessionsAttended: 'Sessions attended',
    sessions30d: 'Last 30 days',
    streak: 'Current streak',
    streakDays: (n: number) => (n === 1 ? '1 day' : `${n} days`),
    streakLongest: (n: number) => `Longest: ${n}`,
    totalPaid: 'Total paid',
    lastAttendance: 'Last attendance',
    noAttendanceShort: 'None yet',
    streakNone: '—',

    // Contact
    contactTitle: 'Contact',
    noContact: 'No contact info recorded.',
    whatsappLabel: 'WhatsApp',
    whatsappCheckInMessage: (name: string) => `Hey ${name}! Just checking in — how's training going?`,

    // Tags
    tagsTitle: 'Tags',
    noTags: 'No tags.',

    // Notes
    notesTitle: 'Notes',
    noNotes: 'No notes.',

    // Health (Week 2 Mission 4)
    healthTitle: 'Health notes',
    noHealth: 'No health notes recorded.',

    // Status (Week 2 Mission 4)
    statusLabels: {
      active: 'Active',
      inactive: 'Inactive',
      lead: 'Lead',
      lapsed: 'Lapsed',
    },

    // History
    historyTitle: 'Attendance history',
    historyEmpty: 'No attendance recorded yet.',
    historyEmptyHint: 'Tap "Record attendance" above to log the first session this client came to.',
    attended: 'Attended',
    notAttended: 'Did not attend',
    paid: 'Paid',
    notPaid: 'Not paid',

    // Attendance row edit / delete affordances
    attEditAria: 'Edit this attendance',
    attDeleteAria: 'Delete this attendance',
    attEditTitle: 'Edit attendance',
    attEditAttendedLabel: 'Attended',
    attEditPaidLabel: 'Paid',
    attEditAmountLabel: 'Amount',
    attEditCurrencyLabel: 'Currency',
    attEditMethodLabel: 'Payment method',
    attEditNotesLabel: 'Notes (optional)',
    attEditSave: 'Save',
    attEditSaving: 'Saving',
    attEditCancel: 'Cancel',
    attEditError: "Couldn't save changes. Try again.",
    attEditConfirmDelete: 'Delete this attendance row? This affects the cached counters on the member detail.',
    attEditDeleting: 'Deleting',
    attEditDeleteError: "Couldn't delete. Try again.",
    methodCash: 'Cash',
    methodTransfer: 'Transfer',
    methodStripe: 'Stripe',
    methodOther: 'Other',

    // Refund flow (migration 083)
    refundCta: 'Refund',
    refundTitle: 'Refund this attendance',
    refundAmountLabel: 'Refund amount',
    refundReasonLabel: 'Reason',
    refundReasonPlaceholder: 'e.g. Member rescheduled, no charge agreed',
    refundConfirm: 'Record refund',
    refundConfirming: 'Recording…',
    refundCancel: 'Cancel',
    refundError: "Couldn't record refund. Try again.",
    refundAmountTooLarge: "Refund can't exceed the amount paid.",
    refundReasonRequired: 'Please add a reason for the refund.',
    refundAlready: 'Already refunded',
    refundedBadge: (amount: string, currency: string) => `Refunded ${amount} ${currency}`,
    refundReasonShown: (reason: string) => `Reason: ${reason}`,

    // Delete confirmation
    purgeToggleLabel: 'Permanently delete all their data (GDPR request)',
    purgeWarning:
      'This wipes attendance, payments, AI insights, training-partner edges, and team memberships. Irreversible. Use this when a member exercises their right to deletion.',
    purgeConfirmLabel: 'Yes, purge permanently',
    purgeOwnerOnly: 'Only the gym owner can permanently delete a client.',
    deleteTitle: 'Delete this client?',
    deleteDesc:
      'This client will be archived. Their attendance history is preserved for your revenue records but they will no longer appear in your active client list. You can undo this from the database if needed.',
    cancel: 'Cancel',
    confirmDelete: 'Yes, delete',
    deleting: 'Deleting',
    deleteError: 'Could not delete the client. Please try again.',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    backToList: 'Volver a clientes',
    edit: 'Editar',
    delete: 'Eliminar',
    redirectingLabel: 'Redirigiendo',
    loading: 'Cargando',
    notFoundTitle: 'Cliente no encontrado',
    notFoundHint: 'Este cliente pudo haber sido eliminado o no tienes acceso.',
    errorTitle: 'No se pudo cargar el cliente',
    retry: 'Reintentar',

    statsTitle: 'Estadísticas',
    sessionsAttended: 'Sesiones asistidas',
    sessions30d: 'Últimos 30 días',
    streak: 'Racha actual',
    streakDays: (n: number) => (n === 1 ? '1 día' : `${n} días`),
    streakLongest: (n: number) => `Mejor: ${n}`,
    totalPaid: 'Total pagado',
    lastAttendance: 'Última asistencia',
    noAttendanceShort: 'Ninguna aún',
    streakNone: '—',

    contactTitle: 'Contacto',
    noContact: 'Sin información de contacto.',
    whatsappLabel: 'WhatsApp',
    whatsappCheckInMessage: (name: string) => `¡Hola ${name}! Pasaba a saludarte. ¿Cómo va el entrenamiento?`,

    tagsTitle: 'Etiquetas',
    noTags: 'Sin etiquetas.',

    notesTitle: 'Notas',
    noNotes: 'Sin notas.',

    healthTitle: 'Notas de salud',
    noHealth: 'Sin notas de salud registradas.',

    statusLabels: {
      active: 'Activo',
      inactive: 'Inactivo',
      lead: 'Prospecto',
      lapsed: 'Suspendido',
    },

    historyTitle: 'Historial de asistencias',
    historyEmpty: 'Aún no hay asistencias registradas.',
    historyEmptyHint: 'Toca "Registrar asistencia" arriba para registrar la primera sesión a la que vino este cliente.',
    attended: 'Asistió',
    notAttended: 'No asistió',
    paid: 'Pagado',
    notPaid: 'No pagado',

    purgeToggleLabel: 'Eliminar permanentemente todos los datos (solicitud GDPR)',
    purgeWarning:
      'Esto borra asistencias, pagos, insights de IA, aristas de compañeros y pertenencia a equipos. Irreversible. Úsalo cuando un miembro ejerce su derecho al borrado.',
    purgeConfirmLabel: 'Sí, eliminar permanentemente',
    purgeOwnerOnly: 'Solo el dueño del gym puede eliminar permanentemente.',

    // Attendance row edit / delete
    attEditAria: 'Editar asistencia',
    attDeleteAria: 'Eliminar asistencia',
    attEditTitle: 'Editar asistencia',
    attEditAttendedLabel: 'Asistió',
    attEditPaidLabel: 'Pagado',
    attEditAmountLabel: 'Monto',
    attEditCurrencyLabel: 'Moneda',
    attEditMethodLabel: 'Método de pago',
    attEditNotesLabel: 'Notas (opcional)',
    attEditSave: 'Guardar',
    attEditSaving: 'Guardando',
    attEditCancel: 'Cancelar',
    attEditError: 'No se pudieron guardar los cambios. Intenta de nuevo.',
    attEditConfirmDelete: '¿Eliminar esta asistencia? Afecta los contadores en cache del cliente.',
    attEditDeleting: 'Eliminando',
    attEditDeleteError: 'No se pudo eliminar. Intenta de nuevo.',
    methodCash: 'Efectivo',
    methodTransfer: 'Transferencia',
    methodStripe: 'Stripe',
    methodOther: 'Otro',

    // Refund flow (migración 083)
    refundCta: 'Reembolsar',
    refundTitle: 'Reembolsar esta asistencia',
    refundAmountLabel: 'Monto a reembolsar',
    refundReasonLabel: 'Razón',
    refundReasonPlaceholder: 'p. ej. El miembro reprogramó, sin cobro acordado',
    refundConfirm: 'Registrar reembolso',
    refundConfirming: 'Registrando…',
    refundCancel: 'Cancelar',
    refundError: 'No se pudo registrar el reembolso. Intenta de nuevo.',
    refundAmountTooLarge: 'El reembolso no puede ser mayor al monto pagado.',
    refundReasonRequired: 'Por favor agrega una razón para el reembolso.',
    refundAlready: 'Ya reembolsada',
    refundedBadge: (amount: string, currency: string) => `Reembolsado ${amount} ${currency}`,
    refundReasonShown: (reason: string) => `Razón: ${reason}`,

    deleteTitle: '¿Eliminar este cliente?',
    deleteDesc:
      'Este cliente será archivado. Su historial de asistencias se conserva para tus registros de ingresos, pero ya no aparecerá en tu lista activa. Puedes deshacer esto desde la base de datos si es necesario.',
    cancel: 'Cancelar',
    confirmDelete: 'Sí, eliminar',
    deleting: 'Eliminando',
    deleteError: 'No se pudo eliminar el cliente. Por favor intenta de nuevo.',
  },
} as const;

export default function ClientDetailPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params?.id;
  const gate = useTribeOSPremiumGate();

  const [state, setState] = useState<DetailState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // When true, the delete dialog's confirm button hits the hard-
  // purge endpoint instead of the soft-archive one. Resets to false
  // each time the dialog re-opens so it's never sticky.
  const [purgeMode, setPurgeMode] = useState(false);

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    if (!clientId) return;
    // Short-circuit obviously-bad params (e.g. someone typed
    // /os/clients/edit or hit a route with the literal [id]
    // placeholder still in the URL). Without this we'd send the
    // bogus value to Supabase, which surfaces a raw
    // "invalid input syntax for type uuid" error.
    if (!isValidUuid(clientId)) {
      setState({ kind: 'not_found' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const [detailRes, attendanceRes] = await Promise.all([
          fetch(`/api/tribe-os/clients/${clientId}/`, { method: 'GET' }),
          fetch(`/api/tribe-os/clients/${clientId}/attendance/`, { method: 'GET' }),
        ]);

        if (detailRes.status === 404) {
          if (!cancelled) setState({ kind: 'not_found' });
          return;
        }

        const detailBody = (await detailRes.json().catch(() => ({}))) as {
          success?: boolean;
          data?: DetailResponse;
          error?: string;
        };
        const attendanceBody = (await attendanceRes.json().catch(() => ({}))) as {
          success?: boolean;
          data?: AttendanceWithSession[];
          error?: string;
        };

        if (cancelled) return;

        if (!detailRes.ok || !detailBody.success || !detailBody.data) {
          setState({ kind: 'error', message: detailBody.error || s.errorTitle });
          return;
        }

        setState({
          kind: 'ready',
          client: detailBody.data.client,
          summary: detailBody.data.summary,
          attendance: attendanceBody.data ?? [],
        });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: s.errorTitle });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gate.state, clientId, reloadKey, s.errorTitle]);

  async function handleDelete() {
    if (!clientId || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    // purgeMode → hard delete via the GDPR endpoint. Default →
    // soft archive (the common case).
    const url = purgeMode ? `/api/tribe-os/clients/${clientId}/purge` : `/api/tribe-os/clients/${clientId}/`;
    const method = purgeMode ? 'POST' : 'DELETE';
    try {
      const res = await fetch(url, { method });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // Map server-side error codes to localized messages.
        let message = body.error || s.deleteError;
        if (body.error === 'owner_only') message = s.purgeOwnerOnly;
        setDeleteError(message);
        setDeleting(false);
        return;
      }
      trackEvent('tribe_os_client_purged', { mode: purgeMode ? 'purge' : 'archive' });
      router.push('/os/clients');
    } catch {
      setDeleteError(s.deleteError);
      setDeleting(false);
    }
  }

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-gray-600 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : ''}
        </p>
      </main>
    );
  }

  return (
    <main className="text-gray-900 px-4 py-8 sm:py-10 pb-24">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/os/clients"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {s.backToList}
        </Link>

        {state.kind === 'loading' ? (
          <p className="py-12 text-center text-sm text-gray-500">{s.loading}…</p>
        ) : state.kind === 'not_found' ? (
          <div className="py-12 text-center space-y-3">
            <h2 className="text-lg font-bold">{s.notFoundTitle}</h2>
            <p className="text-sm text-gray-600">{s.notFoundHint}</p>
          </div>
        ) : state.kind === 'error' ? (
          <div className="py-12 text-center space-y-4">
            <AlertCircle className="w-8 h-8 text-tribe-red mx-auto" />
            <p className="text-sm text-gray-700">{state.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-4 py-2 bg-white text-gray-900 text-sm font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            >
              {s.retry}
            </button>
          </div>
        ) : (
          <>
            <header className="mb-6 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight break-words">
                    {state.client.name}
                  </h1>
                  <StatusBadge status={state.client.status} label={s.statusLabels[state.client.status]} />
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link
                  href={`/os/clients/${state.client.id}/edit`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-gray-900 text-xs font-semibold rounded-lg hover:bg-gray-100 transition-colors"
                  aria-label={s.edit}
                >
                  <Pencil className="w-4 h-4" />
                  <span className="hidden sm:inline">{s.edit}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setShowDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-tribe-red text-xs font-semibold rounded-lg hover:bg-tribe-red/20 transition-colors"
                  aria-label={s.delete}
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">{s.delete}</span>
                </button>
              </div>
            </header>

            {/* Churn-risk intelligence panel — the AI's view of this
                member's health. Surfaces churn_risk_score + health_status
                with a "Rescore now" button (calls /api/tribe-os/ai/
                rescore-member). Rendered first because retention
                follow-up is the most actionable signal. */}
            <div className="mb-4">
              <ChurnRiskPanel
                clientId={state.client.id}
                initialScore={state.client.churn_risk_score}
                initialHealthStatus={state.client.health_status}
                initialUpdatedAt={state.client.churn_risk_updated_at}
              />
            </div>

            {/* Stats card. Two rows:
                  Row 1 (lifetime): Sessions attended | Total paid | Last attendance
                  Row 2 (engagement): Last 30 days     | Current streak (+ longest)
                Row 2 only renders when the AI scoring pipeline has
                touched this client at least once (longest_streak_days
                > 0 OR sessions_last_30_days > 0). Until then the
                cached counters are all 0 and the row would just be
                noise. */}
            <section className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">{s.statsTitle}</h2>
              <div className="grid grid-cols-3 gap-3">
                <Stat label={s.sessionsAttended} value={String(state.summary.total_attended_count)} />
                <Stat
                  label={s.totalPaid}
                  value={
                    formatPaidTotal(state.summary.total_paid_cents_usd, state.summary.total_paid_cents_cop, language) ??
                    '—'
                  }
                />
                <Stat
                  label={s.lastAttendance}
                  value={
                    state.summary.last_attendance_at
                      ? formatShortDate(state.summary.last_attendance_at, language)
                      : s.noAttendanceShort
                  }
                />
              </div>
              {state.client.sessions_last_30_days > 0 || state.client.longest_streak_days > 0 ? (
                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
                  <Stat label={s.sessions30d} value={String(state.client.sessions_last_30_days)} />
                  <Stat
                    label={s.streak}
                    value={
                      state.client.current_streak_days > 0
                        ? s.streakDays(state.client.current_streak_days)
                        : s.streakNone
                    }
                    sublabel={
                      state.client.longest_streak_days > 0
                        ? s.streakLongest(state.client.longest_streak_days)
                        : undefined
                    }
                    // Celebratory chip shows automatically when the
                    // current streak crosses 7/14/30/100 days. Cues
                    // the coach to acknowledge the member.
                    badge={<StreakMilestoneChip currentStreakDays={state.client.current_streak_days} />}
                  />
                </div>
              ) : null}
            </section>

            {/* Contact */}
            <section className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">{s.contactTitle}</h2>
              {state.client.email || state.client.phone ? (
                <ul className="space-y-2 text-sm">
                  {state.client.email ? (
                    <li className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                      <a
                        href={`mailto:${state.client.email}`}
                        className="text-gray-900 hover:text-tribe-green transition-colors break-all"
                      >
                        {state.client.email}
                      </a>
                    </li>
                  ) : null}
                  {state.client.phone ? (
                    <li className="flex items-center gap-2 flex-wrap">
                      <Phone className="w-4 h-4 text-gray-500 shrink-0" />
                      <a
                        href={`tel:${state.client.phone}`}
                        className="text-gray-900 hover:text-tribe-green transition-colors"
                      >
                        {state.client.phone}
                      </a>
                      {/* WhatsApp deep-link — primary follow-up
                          channel for the Medellín market. Only
                          renders when buildWhatsAppUrl produces
                          something dialable (otherwise we'd just
                          show a broken link). Pre-fills a friendly
                          check-in message keyed off the client's
                          first name. */}
                      {(() => {
                        const firstName = state.client.name.split(' ')[0] || state.client.name;
                        const waUrl = buildWhatsAppUrl(state.client.phone, {
                          message: s.whatsappCheckInMessage(firstName),
                        });
                        if (!waUrl) return null;
                        return (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => trackEvent('tribe_os_whatsapp_clicked', { surface: 'client_detail' })}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-tribe-green/15 text-tribe-green text-[11px] font-bold rounded-full border border-tribe-green/30 hover:bg-tribe-green/25 transition-colors ml-1"
                          >
                            <MessageCircle className="w-3 h-3" />
                            {s.whatsappLabel}
                          </a>
                        );
                      })()}
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">{s.noContact}</p>
              )}
            </section>

            {/* Tags */}
            <section className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">{s.tagsTitle}</h2>
              {state.client.tags.length === 0 ? (
                <p className="text-sm text-gray-500">{s.noTags}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {state.client.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-900 text-xs font-medium rounded-full"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Notes */}
            <section className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">{s.notesTitle}</h2>
              {state.client.notes ? (
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{state.client.notes}</p>
              ) : (
                <p className="text-sm text-gray-500">{s.noNotes}</p>
              )}
            </section>

            {/* Health notes (Week 2 Mission 4) */}
            <section className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">{s.healthTitle}</h2>
              {state.client.health_notes ? (
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{state.client.health_notes}</p>
              ) : (
                <p className="text-sm text-gray-500">{s.noHealth}</p>
              )}
            </section>

            {/* Last-90-days attendance heatmap. Visual recall of
                the rhythm — coaches spot a slipping streak or
                accelerating cadence faster than reading numbers.
                Hides itself when there's nothing to show. */}
            <AttendanceHeatmap clientId={state.client.id} />

            {/* Community graph — top training partners. Hides itself
                when this client hasn't co-attended any sessions yet
                so brand-new clients don't get an empty section. */}
            <TrainingPartnersSection clientId={state.client.id} />

            {/* AI insight history — every time the engine flagged
                this client (active + dismissed + expired). Hides
                when zero history. Helps spot patterns over time. */}
            <InsightHistorySection clientId={state.client.id} />

            {/* Attendance history */}
            <section className="mt-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold">{s.historyTitle}</h2>
                {/* Quick attendance affordance — opens an inline form
                    with a session picker + optional payment fields. On
                    successful submit the parent's reloadKey bumps and
                    the history below refreshes. */}
                <RecordAttendanceInline clientId={state.client.id} onRecorded={() => setReloadKey((k) => k + 1)} />
              </div>
              {state.attendance.length === 0 ? (
                <div className="py-8 text-center bg-white rounded-xl border border-gray-200 space-y-2">
                  <p className="text-sm font-semibold text-gray-900">{s.historyEmpty}</p>
                  <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">{s.historyEmptyHint}</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {state.attendance.map((a) => (
                    <AttendanceListItem
                      key={a.id}
                      row={a}
                      language={language}
                      copy={s}
                      onChanged={() => setReloadKey((k) => k + 1)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {/* Delete confirmation dialog. Two modes:
            - Default: soft archive (keeps attendance for revenue records)
            - GDPR toggle: hard purge (cascades to attendance + AI +
              partners + teams; irreversible) */}
      <Dialog
        open={showDelete}
        onOpenChange={(open) => {
          if (!open) {
            setShowDelete(false);
            setPurgeMode(false); // reset so it's never sticky
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="max-w-sm rounded-xl p-6 bg-white border border-gray-200 text-gray-900">
          <DialogTitle className="text-lg font-bold text-tribe-red">{s.deleteTitle}</DialogTitle>
          <p className="text-sm text-gray-700 mt-2 leading-relaxed">{s.deleteDesc}</p>

          {/* GDPR toggle. Off by default — most deletes are
              archives. When checked, the confirm button label
              changes + the destructive warning shows. */}
          <label className="flex items-start gap-2 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={purgeMode}
              onChange={(e) => setPurgeMode(e.target.checked)}
              disabled={deleting}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-tribe-red focus:ring-tribe-red"
            />
            <span className="text-xs text-gray-700 leading-relaxed">{s.purgeToggleLabel}</span>
          </label>
          {purgeMode ? (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-tribe-red leading-relaxed">
              {s.purgeWarning}
            </div>
          ) : null}

          {deleteError ? (
            <div
              className="flex items-start gap-2 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-tribe-red shrink-0 mt-0.5" />
              <span>{deleteError}</span>
            </div>
          ) : null}
          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={() => {
                setShowDelete(false);
                setPurgeMode(false);
                setDeleteError(null);
              }}
              disabled={deleting}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-900 text-sm font-bold rounded-lg hover:bg-tribe-card transition-colors disabled:opacity-60"
            >
              {s.cancel}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 px-4 py-2.5 bg-tribe-red text-gray-900 text-sm font-bold rounded-lg hover:bg-tribe-red/80 transition-colors disabled:opacity-60"
            >
              {deleting ? `${s.deleting}…` : purgeMode ? s.purgeConfirmLabel : s.confirmDelete}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Stat({
  label,
  value,
  sublabel,
  badge,
}: {
  label: string;
  value: string;
  sublabel?: string;
  // Optional inline badge — rendered next to the value. Used for
  // streak milestone chips on the streak stat.
  badge?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-lg font-bold text-gray-900 truncate">{value}</p>
        {badge}
      </div>
      {sublabel ? <p className="text-[10px] text-gray-400 mt-0.5">{sublabel}</p> : null}
    </div>
  );
}

/**
 * Status pill. Active renders nothing (the default state for any
 * client) to keep the header visually clean for the common case.
 * Other statuses get a small color-coded pill matching the list page.
 */
function StatusBadge({ status, label }: { status: ClientRow['status']; label: string }) {
  if (status === 'active') return null;
  const tone =
    status === 'lapsed'
      ? 'bg-tribe-red/20 text-tribe-red border-tribe-red/40'
      : status === 'lead'
        ? 'bg-tribe-amber/20 text-amber-700 border-tribe-amber/40'
        : 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border shrink-0 ${tone}`}
    >
      {label}
    </span>
  );
}

function AttendanceListItem({
  row,
  language,
  copy: s,
  onChanged,
}: {
  row: AttendanceWithSession;
  language: 'en' | 'es';
  copy: typeof copy.en | typeof copy.es;
  onChanged: () => void;
}) {
  // Editing state. We render two distinct UIs from the same component
  // — the compact read-only row, and an expanded inline form. The form
  // keeps its own draft state so cancel restores cleanly.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refund flow state. Separate from editing because the refund is a
  // distinct forensic action (writes to gym_audit_log), and we don't
  // want the cancel-edit button to also dismiss a half-typed refund.
  const [refunding, setRefunding] = useState(false);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  // Draft state — initialized from the row, only used while editing.
  const [draftAttended, setDraftAttended] = useState(row.attended);
  const [draftPaid, setDraftPaid] = useState(row.paid);
  const [draftAmount, setDraftAmount] = useState<string>(
    row.amount_paid_cents != null ? (row.amount_paid_cents / 100).toString() : ''
  );
  const [draftCurrency, setDraftCurrency] = useState<'USD' | 'COP'>(row.currency === 'COP' ? 'COP' : 'USD');
  const [draftMethod, setDraftMethod] = useState<'cash' | 'transfer' | 'stripe' | 'other'>(
    (row.payment_method as 'cash' | 'transfer' | 'stripe' | 'other') || 'cash'
  );
  const [draftNotes, setDraftNotes] = useState<string>(row.notes ?? '');

  const dateIso = row.attended_at ?? row.session?.date ?? row.created_at;
  const dateLabel = formatShortDate(dateIso, language);
  const sessionLabel = row.session?.title ?? row.session?.sport ?? '—';
  const paidLabel =
    row.paid && row.amount_paid_cents != null && row.currency
      ? formatCents(row.amount_paid_cents, row.currency, language)
      : null;

  function startEdit() {
    setEditing(true);
    setError(null);
    // Reset draft to current row values in case the row changed since
    // the component first rendered.
    setDraftAttended(row.attended);
    setDraftPaid(row.paid);
    setDraftAmount(row.amount_paid_cents != null ? (row.amount_paid_cents / 100).toString() : '');
    setDraftCurrency(row.currency === 'COP' ? 'COP' : 'USD');
    setDraftMethod((row.payment_method as 'cash' | 'transfer' | 'stripe' | 'other') || 'cash');
    setDraftNotes(row.notes ?? '');
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      // Build a partial update payload. The Zod schema enforces
      // co-required payment fields, so we always send the trio when
      // paid changes or when paid is currently true.
      const payload: Record<string, unknown> = {
        attended: draftAttended,
        paid: draftPaid,
        notes: draftNotes.trim() || null,
      };
      if (draftPaid) {
        const cents = Math.round(parseFloat(draftAmount || '0') * 100);
        payload.amount_paid_cents = cents;
        payload.currency = draftCurrency;
        payload.payment_method = draftMethod;
      } else {
        // Flipping to unpaid: clear all three payment fields.
        payload.amount_paid_cents = null;
        payload.currency = null;
        payload.payment_method = null;
      }
      const res = await fetch(`/api/tribe-os/attendance/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        setError(s.attEditError);
        setSaving(false);
        return;
      }
      trackEvent('tribe_os_attendance_recorded', { mode: 'edit' });
      setEditing(false);
      setSaving(false);
      onChanged();
    } catch {
      setError(s.attEditError);
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    if (typeof window !== 'undefined' && !window.confirm(s.attEditConfirmDelete)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tribe-os/attendance/${row.id}`, { method: 'DELETE' });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean };
      if (!res.ok || !body.success) {
        setError(s.attEditDeleteError);
        setDeleting(false);
        return;
      }
      trackEvent('tribe_os_attendance_deleted');
      onChanged();
    } catch {
      setError(s.attEditDeleteError);
      setDeleting(false);
    }
  }

  // Open the refund overlay with the amount pre-filled to the full
  // paid amount — partial refunds are possible but the common case
  // is "the whole session got refunded." Coach edits as needed.
  function startRefund() {
    setRefundError(null);
    setRefundReason('');
    setRefundAmount(row.amount_paid_cents != null ? (row.amount_paid_cents / 100).toString() : '');
    setRefunding(true);
  }

  async function handleRefund() {
    if (refundSubmitting) return;
    setRefundError(null);
    const parsed = parseFloat(refundAmount || '0');
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRefundError(s.refundError);
      return;
    }
    const cents = Math.round(parsed * 100);
    if (row.amount_paid_cents != null && cents > row.amount_paid_cents) {
      setRefundError(s.refundAmountTooLarge);
      return;
    }
    const reason = refundReason.trim();
    if (!reason) {
      setRefundError(s.refundReasonRequired);
      return;
    }
    setRefundSubmitting(true);
    try {
      const res = await fetch(`/api/tribe-os/attendance/${row.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refunded_amount_cents: cents, refund_reason: reason }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        // 409 already_refunded / not_paid → use specific copy when we
        // get them, otherwise fall back to the generic error.
        setRefundError(s.refundError);
        setRefundSubmitting(false);
        return;
      }
      trackEvent('tribe_os_attendance_refunded', {
        refunded_amount_cents: cents,
        currency: row.currency ?? null,
      });
      setRefundSubmitting(false);
      setRefunding(false);
      onChanged();
    } catch {
      setRefundError(s.refundError);
      setRefundSubmitting(false);
    }
  }

  if (editing) {
    return (
      <li className="bg-white rounded-xl border border-tribe-green/40 ring-2 ring-tribe-green/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-gray-900">{s.attEditTitle}</p>
          <p className="text-xs text-gray-500">
            {sessionLabel} · {dateLabel}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draftAttended}
              onChange={(e) => setDraftAttended(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-tribe-green focus:ring-tribe-green"
            />
            {s.attEditAttendedLabel}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draftPaid}
              onChange={(e) => setDraftPaid(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-tribe-green focus:ring-tribe-green"
            />
            {s.attEditPaidLabel}
          </label>
        </div>

        {draftPaid ? (
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">{s.attEditAmountLabel}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-tribe-green"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">{s.attEditCurrencyLabel}</span>
              <select
                value={draftCurrency}
                onChange={(e) => setDraftCurrency(e.target.value as 'USD' | 'COP')}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-tribe-green"
              >
                <option value="USD">USD</option>
                <option value="COP">COP</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">{s.attEditMethodLabel}</span>
              <select
                value={draftMethod}
                onChange={(e) => setDraftMethod(e.target.value as 'cash' | 'transfer' | 'stripe' | 'other')}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-tribe-green"
              >
                <option value="cash">{s.methodCash}</option>
                <option value="transfer">{s.methodTransfer}</option>
                <option value="stripe">{s.methodStripe}</option>
                <option value="other">{s.methodOther}</option>
              </select>
            </label>
          </div>
        ) : null}

        <label className="block">
          <span className="block text-xs font-semibold text-gray-700 mb-1">{s.attEditNotesLabel}</span>
          <textarea
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-tribe-green resize-none"
          />
        </label>

        {error ? (
          <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-tribe-red">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-tribe-red hover:bg-red-50 rounded-lg disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? s.attEditDeleting : s.delete}
            </button>
            {/* Refund affordance: only when the row is currently paid
                with a positive amount and hasn't already been refunded.
                Coaches doing routine edits don't need to think about
                this button; it lives here because the refund flow is
                an extension of the edit flow conceptually. */}
            {row.paid && row.amount_paid_cents != null && row.amount_paid_cents > 0 ? (
              row.refunded_amount_cents != null ? (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-500">
                  {s.refundAlready}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={startRefund}
                  disabled={saving || deleting}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-tribe-warning hover:bg-tribe-warning/10 rounded-lg disabled:opacity-50"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  {s.refundCta}
                </button>
              )
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving || deleting}
              className="px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              {s.attEditCancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || deleting}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-tribe-green text-tribe-dark rounded-lg hover:shadow-tribe disabled:opacity-50"
            >
              {saving ? s.attEditSaving : s.attEditSave}
            </button>
          </div>
        </div>

        {/* Refund overlay panel — inline rather than a modal because
            the page is already busy with the edit form, and a modal
            over an inline form is too much z-index. Renders only
            when refunding is true. */}
        {refunding ? (
          <div className="mt-2 p-3 bg-tribe-warning/5 border border-tribe-warning/40 rounded-lg space-y-3">
            <p className="text-sm font-bold text-gray-900">{s.refundTitle}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-700 mb-1">{s.refundAmountLabel}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-tribe-warning"
                />
              </label>
              <div className="flex items-end text-xs text-gray-500 pb-1.5">{row.currency ?? ''}</div>
            </div>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">{s.refundReasonLabel}</span>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder={s.refundReasonPlaceholder}
                rows={2}
                maxLength={500}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-tribe-warning resize-none"
              />
            </label>
            {refundError ? (
              <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-tribe-red">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{refundError}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefunding(false)}
                disabled={refundSubmitting}
                className="px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                {s.refundCancel}
              </button>
              <button
                type="button"
                onClick={handleRefund}
                disabled={refundSubmitting}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-tribe-warning text-white rounded-lg hover:bg-tribe-warning/90 disabled:opacity-50"
              >
                {refundSubmitting ? s.refundConfirming : s.refundConfirm}
              </button>
            </div>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <li className="bg-white rounded-xl border border-gray-200 p-4 group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate">{sessionLabel}</p>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {dateLabel}
          </p>
        </div>
        <div className="flex items-start gap-3 shrink-0">
          <div className="flex flex-col items-end gap-1">
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold ${row.attended ? 'text-tribe-green' : 'text-gray-500'}`}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {row.attended ? s.attended : s.notAttended}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold ${row.paid ? 'text-tribe-green' : 'text-gray-500'}`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              {paidLabel ?? (row.paid ? s.paid : s.notPaid)}
            </span>
          </div>
          {/* Edit affordance — visible on hover desktop, always visible
              on touch so coaches can still tap it on mobile. */}
          <button
            type="button"
            onClick={startEdit}
            aria-label={s.attEditAria}
            title={s.attEditAria}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors sm:opacity-0 sm:group-hover:opacity-100"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {row.notes ? <p className="text-xs text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap">{row.notes}</p> : null}
      {/* Refunded badge — appears on rows where a refund was recorded
          (migration 083). Shows the refunded amount and the coach's
          reason so the history is self-explanatory at a glance. */}
      {row.refunded_amount_cents != null && row.currency ? (
        <div className="mt-2 px-2 py-1.5 bg-tribe-warning/10 border border-tribe-warning/30 rounded-lg text-xs">
          <p className="font-semibold text-tribe-warning">
            {s.refundedBadge(formatCents(row.refunded_amount_cents, row.currency, language), row.currency)}
          </p>
          {row.refund_reason ? (
            <p className="text-gray-700 mt-0.5 leading-relaxed">{s.refundReasonShown(row.refund_reason)}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
