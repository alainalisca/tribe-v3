'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Trash2, Mail, Phone, AlertCircle, Calendar, CheckCircle, DollarSign } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { formatCents, formatPaidTotal, formatShortDate } from '@/lib/format/currency';
import { isValidUuid } from '@/lib/validations/uuid';
import RecordAttendanceInline from '@/components/tribe-os/RecordAttendanceInline';
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
    totalPaid: 'Total paid',
    lastAttendance: 'Last attendance',
    noAttendanceShort: 'None yet',

    // Contact
    contactTitle: 'Contact',
    noContact: 'No contact info recorded.',

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

    // Delete confirmation
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
    totalPaid: 'Total pagado',
    lastAttendance: 'Última asistencia',
    noAttendanceShort: 'Ninguna aún',

    contactTitle: 'Contacto',
    noContact: 'Sin información de contacto.',

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
    try {
      const res = await fetch(`/api/tribe-os/clients/${clientId}/`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setDeleteError(body.error || s.deleteError);
        setDeleting(false);
        return;
      }
      router.push('/os/clients');
    } catch {
      setDeleteError(s.deleteError);
      setDeleting(false);
    }
  }

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-white/70 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : ''}
        </p>
      </main>
    );
  }

  return (
    <main className="text-white px-4 py-8 sm:py-10 pb-24">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/os/clients"
          className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {s.backToList}
        </Link>

        {state.kind === 'loading' ? (
          <p className="py-12 text-center text-sm text-white/60">{s.loading}…</p>
        ) : state.kind === 'not_found' ? (
          <div className="py-12 text-center space-y-3">
            <h2 className="text-lg font-bold">{s.notFoundTitle}</h2>
            <p className="text-sm text-white/70">{s.notFoundHint}</p>
          </div>
        ) : state.kind === 'error' ? (
          <div className="py-12 text-center space-y-4">
            <AlertCircle className="w-8 h-8 text-tribe-red mx-auto" />
            <p className="text-sm text-white/80">{state.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-4 py-2 bg-tribe-surface text-white text-sm font-semibold rounded-lg hover:bg-tribe-mid transition-colors"
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
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-tribe-surface text-white text-xs font-semibold rounded-lg hover:bg-tribe-mid transition-colors"
                  aria-label={s.edit}
                >
                  <Pencil className="w-4 h-4" />
                  <span className="hidden sm:inline">{s.edit}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setShowDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-tribe-surface text-tribe-red text-xs font-semibold rounded-lg hover:bg-tribe-red/20 transition-colors"
                  aria-label={s.delete}
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">{s.delete}</span>
                </button>
              </div>
            </header>

            {/* Stats card */}
            <section className="bg-tribe-surface rounded-xl border border-tribe-mid p-4 mb-4">
              <h2 className="text-xs uppercase tracking-[0.1em] text-white/50 font-semibold mb-3">{s.statsTitle}</h2>
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
            </section>

            {/* Contact */}
            <section className="bg-tribe-surface rounded-xl border border-tribe-mid p-4 mb-4">
              <h2 className="text-xs uppercase tracking-[0.1em] text-white/50 font-semibold mb-3">{s.contactTitle}</h2>
              {state.client.email || state.client.phone ? (
                <ul className="space-y-2 text-sm">
                  {state.client.email ? (
                    <li className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-white/50 shrink-0" />
                      <a
                        href={`mailto:${state.client.email}`}
                        className="text-white hover:text-tribe-green transition-colors break-all"
                      >
                        {state.client.email}
                      </a>
                    </li>
                  ) : null}
                  {state.client.phone ? (
                    <li className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-white/50 shrink-0" />
                      <a
                        href={`tel:${state.client.phone}`}
                        className="text-white hover:text-tribe-green transition-colors"
                      >
                        {state.client.phone}
                      </a>
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="text-sm text-white/60">{s.noContact}</p>
              )}
            </section>

            {/* Tags */}
            <section className="bg-tribe-surface rounded-xl border border-tribe-mid p-4 mb-4">
              <h2 className="text-xs uppercase tracking-[0.1em] text-white/50 font-semibold mb-3">{s.tagsTitle}</h2>
              {state.client.tags.length === 0 ? (
                <p className="text-sm text-white/60">{s.noTags}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {state.client.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center px-2.5 py-1 bg-tribe-mid text-white text-xs font-medium rounded-full"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Notes */}
            <section className="bg-tribe-surface rounded-xl border border-tribe-mid p-4 mb-4">
              <h2 className="text-xs uppercase tracking-[0.1em] text-white/50 font-semibold mb-3">{s.notesTitle}</h2>
              {state.client.notes ? (
                <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">{state.client.notes}</p>
              ) : (
                <p className="text-sm text-white/60">{s.noNotes}</p>
              )}
            </section>

            {/* Health notes (Week 2 Mission 4) */}
            <section className="bg-tribe-surface rounded-xl border border-tribe-mid p-4 mb-4">
              <h2 className="text-xs uppercase tracking-[0.1em] text-white/50 font-semibold mb-3">{s.healthTitle}</h2>
              {state.client.health_notes ? (
                <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">{state.client.health_notes}</p>
              ) : (
                <p className="text-sm text-white/60">{s.noHealth}</p>
              )}
            </section>

            {/* Attendance history */}
            <section className="mt-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-xs uppercase tracking-[0.1em] text-white/50 font-semibold">{s.historyTitle}</h2>
                {/* Quick attendance affordance — opens an inline form
                    with a session picker + optional payment fields. On
                    successful submit the parent's reloadKey bumps and
                    the history below refreshes. */}
                <RecordAttendanceInline clientId={state.client.id} onRecorded={() => setReloadKey((k) => k + 1)} />
              </div>
              {state.attendance.length === 0 ? (
                <div className="py-8 text-center bg-tribe-surface rounded-xl border border-tribe-mid space-y-2">
                  <p className="text-sm font-semibold text-white">{s.historyEmpty}</p>
                  <p className="text-xs text-white/60 max-w-xs mx-auto leading-relaxed">{s.historyEmptyHint}</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {state.attendance.map((a) => (
                    <AttendanceListItem key={a.id} row={a} language={language} copy={s} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDelete} onOpenChange={(open) => !open && setShowDelete(false)}>
        <DialogContent className="max-w-sm rounded-xl p-6 bg-tribe-surface border border-tribe-mid text-white">
          <DialogTitle className="text-lg font-bold text-tribe-red">{s.deleteTitle}</DialogTitle>
          <p className="text-sm text-white/80 mt-2 leading-relaxed">{s.deleteDesc}</p>
          {deleteError ? (
            <div
              className="flex items-start gap-2 mt-3 p-3 bg-tribe-red/10 border border-tribe-red/30 rounded-lg text-sm"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-tribe-red shrink-0 mt-0.5" />
              <span>{deleteError}</span>
            </div>
          ) : null}
          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={() => setShowDelete(false)}
              disabled={deleting}
              className="flex-1 px-4 py-2.5 bg-tribe-mid text-white text-sm font-bold rounded-lg hover:bg-tribe-card transition-colors disabled:opacity-60"
            >
              {s.cancel}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 px-4 py-2.5 bg-tribe-red text-white text-sm font-bold rounded-lg hover:bg-tribe-red/80 transition-colors disabled:opacity-60"
            >
              {deleting ? `${s.deleting}…` : s.confirmDelete}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-white/50 mb-1">{label}</p>
      <p className="text-lg font-bold text-white truncate">{value}</p>
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
        ? 'bg-tribe-amber/20 text-tribe-amber border-tribe-amber/40'
        : 'bg-tribe-mid text-white/70 border-tribe-mid';
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
}: {
  row: AttendanceWithSession;
  language: 'en' | 'es';
  copy: typeof copy.en | typeof copy.es;
}) {
  const dateIso = row.attended_at ?? row.session?.date ?? row.created_at;
  const dateLabel = formatShortDate(dateIso, language);
  const sessionLabel = row.session?.title ?? row.session?.sport ?? '—';
  const paidLabel =
    row.paid && row.amount_paid_cents != null && row.currency
      ? formatCents(row.amount_paid_cents, row.currency, language)
      : null;

  return (
    <li className="bg-tribe-surface rounded-xl border border-tribe-mid p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{sessionLabel}</p>
          <p className="text-xs text-white/60 mt-0.5 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {dateLabel}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold ${row.attended ? 'text-tribe-green' : 'text-white/50'}`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {row.attended ? s.attended : s.notAttended}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold ${row.paid ? 'text-tribe-green' : 'text-white/50'}`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            {paidLabel ?? (row.paid ? s.paid : s.notPaid)}
          </span>
        </div>
      </div>
      {row.notes ? <p className="text-xs text-white/70 mt-2 leading-relaxed whitespace-pre-wrap">{row.notes}</p> : null}
    </li>
  );
}
