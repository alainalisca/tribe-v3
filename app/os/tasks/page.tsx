'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { Button, Badge } from '@/components/tribe-os/ui';
import DraftModal from '@/components/tribe-os/DraftModal';
import type { DraftContext } from '@/lib/tribe-os/drafts/templates';
import { STEP_CHANNEL_LABELS, STOP_REASONS } from '@/lib/tribe-os/sequences/helpers';
import { showError, showInfo } from '@/lib/toast';
import { Check, MessageCircle, Square, RefreshCw } from 'lucide-react';

const copy = {
  en: {
    pageTitle: 'Today\'s tasks',
    subtitle: 'Sequence follow-ups due today',
    loading: 'Loading',
    redirecting: 'Redirecting',
    emptyTitle: 'No tasks for today',
    emptyHint: 'When members are enrolled in a sequence, their due steps appear here.',
    stepOf: (pos: number, total: number) => `Step ${pos} of ${total}`,
    overdueBy: (d: number) => d === 1 ? 'Overdue by 1 day' : `Overdue by ${d} days`,
    dueToday: 'Due today',
    daysSinceVisit: (d: number) => d === 1 ? '1 day absent' : `${d} days absent`,
    plan: 'Plan',
    write: 'Write',
    done: 'Done',
    stop: 'Stop',
    stopTitle: 'Stop sequence',
    stopCancel: 'Cancel',
    stopConfirm: 'Stop',
    approvalsTitle: 'Approvals',
    approve: 'Approve',
    reject: 'Reject',
    approvalSystem: 'System suggestion',
    refreshing: 'Refreshing...',
    refresh: 'Refresh',
    activeEnrollments: (n: number) => n === 1 ? '1 active enrollment' : `${n} active enrollments`,
    completing: 'Saving...',
    errorComplete: 'Could not mark as done. Try again.',
    errorStop: 'Could not stop sequence. Try again.',
    errorApprove: 'Could not process approval. Try again.',
    reconcileWarning: 'Background sync failed. Data may be stale.',
    suggestedToday: (n: number, cap: number) => `Suggested today: ${n} of ${cap}`,
    autoStartedToday: (n: number, cap: number) => `Auto-started today: ${n} of ${cap}`,
  },
  es: {
    pageTitle: 'Tareas de hoy',
    subtitle: 'Seguimientos pendientes para hoy',
    loading: 'Cargando',
    redirecting: 'Redirigiendo',
    emptyTitle: 'Sin tareas para hoy',
    emptyHint: 'Cuando los miembros estén inscritos en una secuencia, sus pasos pendientes aparecen aquí.',
    stepOf: (pos: number, total: number) => `Paso ${pos} de ${total}`,
    overdueBy: (d: number) => d === 1 ? 'Vencido hace 1 día' : `Vencido hace ${d} días`,
    dueToday: 'Para hoy',
    daysSinceVisit: (d: number) => d === 1 ? '1 día ausente' : `${d} días ausente`,
    plan: 'Plan',
    write: 'Escribir',
    done: 'Hecho',
    stop: 'Detener',
    stopTitle: 'Detener secuencia',
    stopCancel: 'Cancelar',
    stopConfirm: 'Detener',
    approvalsTitle: 'Aprobaciones',
    approve: 'Aprobar',
    reject: 'Rechazar',
    approvalSystem: 'Sugerencia del sistema',
    refreshing: 'Actualizando...',
    refresh: 'Actualizar',
    activeEnrollments: (n: number) => n === 1 ? '1 inscripción activa' : `${n} inscripciones activas`,
    completing: 'Guardando...',
    errorComplete: 'No se pudo marcar como hecho. Intenta de nuevo.',
    errorStop: 'No se pudo detener la secuencia. Intenta de nuevo.',
    reconcileWarning: 'No se pudo sincronizar. Los datos pueden estar desactualizados.',
    errorApprove: 'No se pudo procesar la aprobación. Intenta de nuevo.',
    suggestedToday: (n: number, cap: number) => `Sugeridos hoy: ${n} de ${cap}`,
    autoStartedToday: (n: number, cap: number) => `Iniciados automáticamente hoy: ${n} de ${cap}`,
  },
} as const;

interface TaskItem {
  enrollmentId: string;
  clientId: string;
  clientName: string | null;
  clientPhone: string | null;
  sequenceName: string;
  stepPosition: number;
  totalSteps: number;
  channel: string;
  templateKey: string | null;
  note: string | null;
  dueDateStr: string;
  overdue: boolean;
  overdueDaysCount: number;
  daysSinceLastActivity: number | null;
  planValue: string | null;
}

interface PendingItem {
  enrollmentId: string;
  clientId: string;
  clientName: string | null;
  sequenceName: string;
  enrolledByType: string;
}

interface TasksData {
  tasks: TaskItem[];
  pending: PendingItem[];
  activeCount: number;
  autonomy: string;
  isOwner: boolean;
  systemEnrolledToday: number;
  systemDailyCap: number;
}

export default function TasksPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [data, setData] = useState<TasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftTarget, setDraftTarget] = useState<TaskItem | null>(null);
  const [stopTarget, setStopTarget] = useState<TaskItem | null>(null);

  const fetchTasks = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const rc = await fetch('/api/tribe-os/sequences/reconcile', { method: 'POST' });
      if (!rc.ok) {
        console.error('[reconcile]', rc.status);
        showInfo(s.reconcileWarning);
      }
    } catch (err) {
      console.error('[reconcile]', err);
      showInfo(s.reconcileWarning);
    }
    try {
      const res = await fetch('/api/tribe-os/sequences/tasks');
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [s.reconcileWarning]);

  useEffect(() => {
    if (gate.state === 'allowed') {
      trackEvent('tribe_os_tasks_viewed');
      fetchTasks();
    }
  }, [gate.state, fetchTasks]);

  const handleComplete = async (task: TaskItem) => {
    if (busyId) return;
    setBusyId(task.enrollmentId);
    try {
      const res = await fetch('/api/tribe-os/sequences/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'complete',
          enrollment_id: task.enrollmentId,
          step_position: task.stepPosition,
          channel: task.channel,
          client_id: task.clientId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_task_completed');
        await fetchTasks(true);
      } else {
        showError(s.errorComplete);
        console.error('[complete]', json);
      }
    } catch (err) {
      showError(s.errorComplete);
      console.error('[complete]', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = async (enrollmentId: string, action: 'approve' | 'reject') => {
    if (busyId) return;
    setBusyId(enrollmentId);
    try {
      const res = await fetch('/api/tribe-os/sequences/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'approve',
          enrollment_id: enrollmentId,
          action,
          reason: action === 'reject' ? 'Rechazado' : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent(action === 'approve' ? 'tribe_os_enrollment_approved' : 'tribe_os_enrollment_rejected');
        await fetchTasks(true);
      } else {
        showError(s.errorApprove);
        console.error('[approve]', json);
      }
    } catch (err) {
      showError(s.errorApprove);
      console.error('[approve]', err);
    } finally {
      setBusyId(null);
    }
  };

  const handleStop = async (enrollmentId: string, reason: string) => {
    if (busyId) return;
    setBusyId(enrollmentId);
    try {
      const res = await fetch('/api/tribe-os/sequences/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'stop',
          enrollment_id: enrollmentId,
          reason,
        }),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent('tribe_os_enrollment_stopped');
        setStopTarget(null);
        await fetchTasks(true);
      } else {
        showError(s.errorStop);
        console.error('[stop]', json);
      }
    } catch (err) {
      showError(s.errorStop);
      console.error('[stop]', err);
    } finally {
      setBusyId(null);
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

  const tasks = data?.tasks ?? [];
  const pending = data?.pending ?? [];
  const channelLabels = STEP_CHANNEL_LABELS[language];
  const stopReasons = STOP_REASONS[language];

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-tribe-dark">{s.pageTitle}</h1>
            <p className="text-sm text-tribe-dark-80 mt-1">{s.subtitle}</p>
            {data && (
              <p className="text-xs text-tribe-dark-80 mt-0.5">{s.activeEnrollments(data.activeCount)}</p>
            )}
          </div>
          <Button onClick={() => fetchTasks(true)} loading={refreshing} size="sm" variant="secondary">
            <RefreshCw className="h-4 w-4 mr-2" />
            {refreshing ? s.refreshing : s.refresh}
          </Button>
        </header>

        {loading ? (
          <p className="text-tribe-dark-80 text-sm py-12 text-center">{s.loading}...</p>
        ) : tasks.length === 0 && pending.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-tribe shadow-tribe">
            <Square className="h-10 w-10 text-tribe-dark-80 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold text-tribe-dark">{s.emptyTitle}</p>
            <p className="text-xs text-tribe-dark-80 mt-1 max-w-xs mx-auto">{s.emptyHint}</p>
          </div>
        ) : (
          <>
            {tasks.length > 0 && (
              <section className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={`${task.enrollmentId}-${task.stepPosition}`}
                    className={`bg-white rounded-tribe shadow-tribe px-4 py-3 ${
                      task.overdue ? 'border-l-4 border-l-red-400' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/os/clients/${task.clientId}`}
                            className="font-semibold text-tribe-dark hover:text-tribe-green-dark transition-colors truncate"
                          >
                            {task.clientName ?? 'Sin nombre'}
                          </Link>
                          <span className="text-xs text-tribe-dark-80">{task.sequenceName}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs font-medium text-tribe-dark">
                            {s.stepOf(task.stepPosition, task.totalSteps)} · {channelLabels[task.channel as keyof typeof channelLabels] ?? task.channel}
                          </span>
                          {task.overdue ? (
                            <Badge variant="danger">{s.overdueBy(task.overdueDaysCount)}</Badge>
                          ) : (
                            <Badge variant="info">{s.dueToday}</Badge>
                          )}
                        </div>
                        {task.note && (
                          <p className="text-xs text-tribe-dark-80 mt-1 line-clamp-2">{task.note}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-tribe-dark-80">
                          {task.daysSinceLastActivity != null && (
                            <span>{s.daysSinceVisit(task.daysSinceLastActivity)}</span>
                          )}
                          {task.planValue && (
                            <span>{s.plan}: {task.planValue}</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDraftTarget(task)}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-tribe bg-tribe-green-50 hover:bg-tribe-green text-tribe-green-dark transition-colors"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          {s.write}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleComplete(task)}
                          disabled={!!busyId}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-bold rounded-tribe bg-tribe-green text-tribe-dark hover:shadow-tribe transition-shadow disabled:opacity-40"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {busyId === task.enrollmentId ? s.completing : s.done}
                        </button>
                        <button
                          type="button"
                          onClick={() => setStopTarget(task)}
                          className="px-2 py-2 text-xs font-medium rounded-tribe text-tribe-dark-80 hover:bg-gray-100 transition-colors"
                        >
                          {s.stop}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {data && (data.autonomy === 'suggest' || data.autonomy === 'auto') && (
              <p className="text-xs text-tribe-dark-80">
                {data.autonomy === 'suggest'
                  ? s.suggestedToday(data.systemEnrolledToday, data.systemDailyCap)
                  : s.autoStartedToday(data.systemEnrolledToday, data.systemDailyCap)}
              </p>
            )}

            {pending.length > 0 && data?.isOwner && (
              <section>
                <h2 className="text-lg font-bold text-tribe-dark mb-3">{s.approvalsTitle}</h2>
                <div className="space-y-2">
                  {pending.map((p) => (
                    <div key={p.enrollmentId} className="bg-white rounded-tribe shadow-tribe px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/os/clients/${p.clientId}`}
                              className="font-semibold text-tribe-dark hover:text-tribe-green-dark transition-colors truncate"
                            >
                              {p.clientName ?? 'Sin nombre'}
                            </Link>
                            <span className="text-xs text-tribe-dark-80">{p.sequenceName}</span>
                          </div>
                          {p.enrolledByType === 'system' && (
                            <p className="text-xs text-tribe-dark-80 mt-0.5">{s.approvalSystem}</p>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleApprove(p.enrollmentId, 'approve')}
                            disabled={!!busyId}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-tribe bg-tribe-green text-tribe-dark hover:shadow-tribe transition-shadow disabled:opacity-40"
                          >
                            {s.approve}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApprove(p.enrollmentId, 'reject')}
                            disabled={!!busyId}
                            className="px-2 py-1.5 text-xs font-medium rounded-tribe text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                          >
                            {s.reject}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {stopTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-tribe shadow-lg max-w-sm w-full p-5 space-y-3">
            <h3 className="font-bold text-tribe-dark">{s.stopTitle}</h3>
            <p className="text-sm text-tribe-dark-80">
              {stopTarget.clientName} - {stopTarget.sequenceName}
            </p>
            <div className="space-y-2">
              {stopReasons.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => handleStop(stopTarget.enrollmentId, r.label)}
                  disabled={!!busyId}
                  className="w-full text-left px-3 py-2 text-sm rounded-tribe hover:bg-gray-100 transition-colors disabled:opacity-40"
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStopTarget(null)}
              className="w-full text-center px-3 py-2 text-sm font-medium text-tribe-dark-80 hover:bg-gray-100 rounded-tribe transition-colors"
            >
              {s.stopCancel}
            </button>
          </div>
        </div>
      )}

      {draftTarget && (
        <DraftModal
          open={!!draftTarget}
          onClose={() => setDraftTarget(null)}
          context={
            {
              memberId: draftTarget.clientId,
              memberName: draftTarget.clientName,
              phone: draftTarget.clientPhone,
              reasons: [],
              daysSinceLastActivity: draftTarget.daysSinceLastActivity,
              lastActivityAt: null,
              lastTouchCreatedAt: null,
              language,
            } satisfies DraftContext
          }
          onTouchRecorded={() => fetchTasks(true)}
        />
      )}
    </div>
  );
}
