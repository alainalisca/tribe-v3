'use client';

/**
 * SampleDataSeedButton — dev-only one-click sample-data seeder.
 *
 * Mounted on /os/gym for the gym owner. Renders nothing unless the
 * client-side flag NEXT_PUBLIC_ALLOW_SAMPLE_DATA_SEED is "true",
 * which we set in local / staging envs but never in production.
 * The server enforces a matching ALLOW_SAMPLE_DATA_SEED check —
 * the client gate is just for UI hygiene (don't show a button that
 * always 404s).
 *
 * Flow:
 *   1. Owner clicks "Seed sample data"
 *   2. Confirmation dialog explains what'll happen
 *   3. POST /api/tribe-os/dev/seed-sample-data
 *   4. Show summary: "Created 10 clients, 12 sessions, 48 attendance rows"
 *   5. User opens /os/intelligence → "Run intelligence engine" → see
 *      all four insight types fire
 *
 * Safety:
 *   - Backend refuses to seed when the gym already has clients
 *   - Every seeded row carries tag='sample-data' for easy cleanup
 */

import { useState } from 'react';
import { Sparkles, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/tribe-os/ui';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface Props {
  /** Owner-only gate, mirrors the gym-settings canEdit semantics. */
  canEdit: boolean;
}

type Result =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; clients: number; sessions: number; attendance: number }
  | { kind: 'cleaning' }
  | { kind: 'cleaned'; clients: number; sessions: number; insights: number }
  | { kind: 'error'; message: string };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    sectionLabel: 'Dev tools',
    sectionHint: 'These are only visible in development / staging environments. Production deployments lock them off.',
    buttonLabel: 'Seed sample data',
    buttonHint:
      'Drops 10 sample clients + 12 sessions + ~50 attendance rows into your gym so you can demo Tribe.OS end-to-end. Refuses to run when your gym already has clients.',
    dialogTitle: 'Seed sample data?',
    dialogBody:
      'This adds 10 clients (tagged "sample-data"), 12 sessions across 3 weekly series, and ~50 attendance rows distributed to exercise the AI engine. The pattern is deliberately shaped so all four insight types — churn risk, retention opportunity, revenue, growth — will fire when you run the intelligence engine afterward.',
    dialogConfirm: 'Yes, seed it',
    dialogCancel: 'Cancel',
    running: 'Seeding…',
    doneTitle: 'Done.',
    doneSummary: (c: number, s: number, a: number) => `Created ${c} clients, ${s} sessions, ${a} attendance rows.`,
    doneNext: 'Open /os/intelligence and click "Run intelligence engine" to score the dataset and emit insights.',
    errorTitle: 'Could not seed.',
    errorExistingClients: 'Your gym already has clients. The seeder refuses to mix sample data with a real roster.',
    errorSeedDisabled: 'The seed endpoint is disabled on this environment.',
    errorOwnerOnly: 'Only the gym owner can run this.',
    errorGeneric: 'Something went wrong on the server. Check the Vercel logs.',
    cleanupButtonLabel: 'Remove sample data',
    cleanupRunning: 'Removing…',
    cleanupConfirmTitle: 'Remove all sample data?',
    cleanupConfirmBody:
      'This drops every client tagged "sample-data", their attendance + training-partner edges (via DB cascade), every seeded session, and any AI insights that referenced only sample clients. Real client data is never touched.',
    cleanupConfirmYes: 'Yes, remove it',
    cleanupDoneTitle: 'Sample data removed.',
    cleanupDoneSummary: (c: number, s: number, i: number) => `Deleted ${c} clients, ${s} sessions, ${i} insights.`,
    cleanupErrorTitle: 'Could not remove sample data.',
  },
  es: {
    sectionLabel: 'Herramientas de desarrollo',
    sectionHint: 'Solo aparecen en entornos de desarrollo o staging. Los despliegues de producción las bloquean.',
    buttonLabel: 'Generar datos de muestra',
    buttonHint:
      'Crea 10 clientes + 12 sesiones + ~50 asistencias en tu gym para demostrar Tribe.OS de extremo a extremo. Se niega a ejecutarse si tu gym ya tiene clientes.',
    dialogTitle: '¿Generar datos de muestra?',
    dialogBody:
      'Agrega 10 clientes (con la etiqueta "sample-data"), 12 sesiones en 3 series semanales, y ~50 asistencias diseñadas para ejercitar el motor de IA. El patrón está hecho para que los 4 tipos de insight — riesgo de abandono, oportunidad de retención, ingresos, crecimiento — disparen al ejecutar el motor.',
    dialogConfirm: 'Sí, generar',
    dialogCancel: 'Cancelar',
    running: 'Generando…',
    doneTitle: 'Listo.',
    doneSummary: (c: number, s: number, a: number) => `Se crearon ${c} clientes, ${s} sesiones, ${a} asistencias.`,
    doneNext:
      'Abre /os/intelligence y pulsa "Ejecutar motor de inteligencia" para puntuar el dataset y emitir los insights.',
    errorTitle: 'No se pudo generar.',
    errorExistingClients:
      'Tu gym ya tiene clientes. El generador se niega a mezclar datos de muestra con un roster real.',
    errorSeedDisabled: 'El endpoint del generador está deshabilitado en este entorno.',
    errorOwnerOnly: 'Solo el dueño del gym puede ejecutar esto.',
    errorGeneric: 'Algo falló en el servidor. Revisa los logs de Vercel.',
    cleanupButtonLabel: 'Eliminar datos de muestra',
    cleanupRunning: 'Eliminando…',
    cleanupConfirmTitle: '¿Eliminar todos los datos de muestra?',
    cleanupConfirmBody:
      'Esto elimina cada cliente con la etiqueta "sample-data", sus asistencias y aristas de compañeros (vía cascada de la DB), cada sesión generada, y cualquier insight de IA que referenciara solo clientes de muestra. Los datos reales no se tocan.',
    cleanupConfirmYes: 'Sí, eliminarlos',
    cleanupDoneTitle: 'Datos de muestra eliminados.',
    cleanupDoneSummary: (c: number, s: number, i: number) =>
      `Se eliminaron ${c} clientes, ${s} sesiones, ${i} insights.`,
    cleanupErrorTitle: 'No se pudieron eliminar los datos de muestra.',
  },
} as const;

function isSeedEnabled(): boolean {
  // Reads the client-exposed env var; the server has its own check
  // on ALLOW_SAMPLE_DATA_SEED (no NEXT_PUBLIC prefix). Both must be
  // true for the seed to render + run.
  return process.env.NEXT_PUBLIC_ALLOW_SAMPLE_DATA_SEED === 'true';
}

export default function SampleDataSeedButton({ canEdit }: Props) {
  const { language } = useLanguage();
  const s = copy[language];
  // Single confirm state shared by seed + cleanup; discriminated by
  // `kind` so the dialog knows which action to fire on confirmation.
  const [confirm, setConfirm] = useState<{ kind: 'none' } | { kind: 'seed' } | { kind: 'cleanup' }>({
    kind: 'none',
  });
  const [result, setResult] = useState<Result>({ kind: 'idle' });

  if (!isSeedEnabled()) return null;
  if (!canEdit) return null;

  async function handleSeed() {
    setConfirm({ kind: 'none' });
    setResult({ kind: 'running' });
    try {
      const res = await fetch('/api/tribe-os/dev/seed-sample-data', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { clients_created: number; sessions_created: number; attendance_created: number };
        error?: string;
      };
      if (!res.ok || !body.success) {
        // Map server-side error codes to localized messages. Explicit
        // string type sidesteps the literal-narrowing that `as const`
        // gives the copy bag.
        let message: string = s.errorGeneric;
        if (body.error === 'existing_clients') message = s.errorExistingClients;
        else if (body.error === 'seed_disabled') message = s.errorSeedDisabled;
        else if (body.error === 'owner_only') message = s.errorOwnerOnly;
        setResult({ kind: 'error', message });
        return;
      }
      const data = body.data!;
      setResult({
        kind: 'done',
        clients: data.clients_created,
        sessions: data.sessions_created,
        attendance: data.attendance_created,
      });
    } catch {
      setResult({ kind: 'error', message: s.errorGeneric });
    }
  }

  async function handleCleanup() {
    setConfirm({ kind: 'none' });
    setResult({ kind: 'cleaning' });
    try {
      const res = await fetch('/api/tribe-os/dev/cleanup-sample-data', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { clients_deleted: number; sessions_deleted: number; insights_deleted: number };
        error?: string;
      };
      if (!res.ok || !body.success) {
        let message: string = s.errorGeneric;
        if (body.error === 'seed_disabled') message = s.errorSeedDisabled;
        else if (body.error === 'owner_only') message = s.errorOwnerOnly;
        setResult({ kind: 'error', message });
        return;
      }
      const data = body.data!;
      setResult({
        kind: 'cleaned',
        clients: data.clients_deleted,
        sessions: data.sessions_deleted,
        insights: data.insights_deleted,
      });
    } catch {
      setResult({ kind: 'error', message: s.errorGeneric });
    }
  }

  const isBusy = result.kind === 'running' || result.kind === 'cleaning';

  return (
    <div className="pt-2 mt-4 border-t border-gray-200">
      <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-1">{s.sectionLabel}</h2>
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">{s.sectionHint}</p>

      {/* Two side-by-side buttons. Seed runs first, cleanup undoes
          the seed. Mutually exclusive — when one is running the
          other is disabled to prevent overlapping requests. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => setConfirm({ kind: 'seed' })} disabled={isBusy}>
          <Sparkles className="w-4 h-4 mr-1.5" />
          {result.kind === 'running' ? s.running : s.buttonLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setConfirm({ kind: 'cleanup' })} disabled={isBusy}>
          <Trash2 className="w-4 h-4 mr-1.5 text-tribe-danger" />
          {result.kind === 'cleaning' ? s.cleanupRunning : s.cleanupButtonLabel}
        </Button>
      </div>
      <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{s.buttonHint}</p>

      {/* Inline result panel — keeps the user on /os/gym instead of
          bouncing them somewhere else. */}
      {result.kind === 'done' ? (
        <div className="mt-3 p-3 bg-tribe-green/10 border border-tribe-green/30 rounded-lg space-y-2">
          <div className="flex items-start gap-2 text-tribe-dark">
            <CheckCircle2 className="w-4 h-4 text-tribe-green-dark shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold">{s.doneTitle}</p>
              <p>{s.doneSummary(result.clients, result.sessions, result.attendance)}</p>
              <p className="text-xs text-gray-600 mt-1">{s.doneNext}</p>
            </div>
          </div>
        </div>
      ) : null}

      {result.kind === 'cleaned' ? (
        <div className="mt-3 p-3 bg-tribe-green/10 border border-tribe-green/30 rounded-lg flex items-start gap-2 text-tribe-dark">
          <CheckCircle2 className="w-4 h-4 text-tribe-green-dark shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">{s.cleanupDoneTitle}</p>
            <p>{s.cleanupDoneSummary(result.clients, result.sessions, result.insights)}</p>
          </div>
        </div>
      ) : null}

      {result.kind === 'error' ? (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-tribe-dark">
          <AlertCircle className="w-4 h-4 text-tribe-danger shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{s.errorTitle}</p>
            <p className="text-xs text-gray-700 mt-0.5">{result.message}</p>
          </div>
        </div>
      ) : null}

      <Dialog open={confirm.kind !== 'none'} onOpenChange={(v) => !v && setConfirm({ kind: 'none' })}>
        <DialogContent className="max-w-md rounded-tribe p-5 bg-white border border-tribe-dark-40 text-tribe-dark">
          <DialogTitle className="text-base font-bold text-tribe-dark">
            {confirm.kind === 'cleanup' ? s.cleanupConfirmTitle : s.dialogTitle}
          </DialogTitle>
          <p className="text-sm text-tribe-dark-80 mt-2 leading-relaxed">
            {confirm.kind === 'cleanup' ? s.cleanupConfirmBody : s.dialogBody}
          </p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="secondary" type="button" onClick={() => setConfirm({ kind: 'none' })}>
              {s.dialogCancel}
            </Button>
            <Button type="button" onClick={confirm.kind === 'cleanup' ? handleCleanup : handleSeed}>
              {confirm.kind === 'cleanup' ? s.cleanupConfirmYes : s.dialogConfirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
