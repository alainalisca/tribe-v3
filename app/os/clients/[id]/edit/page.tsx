'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import ClientForm from '@/components/tribe-os/ClientForm';
import { trackEvent } from '@/lib/analytics';
import { isValidUuid } from '@/lib/validations/uuid';
import type { ClientAttendanceSummary, ClientRow } from '@/lib/dal/clients';

interface DetailResponse {
  client: ClientRow;
  summary: ClientAttendanceSummary;
}

const copy = {
  en: {
    title: 'Edit client',
    submit: 'Save changes',
    redirectingLabel: 'Redirecting',
    loading: 'Loading',
    notFound: 'Client not found.',
    loadError: 'Could not load this client.',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    title: 'Editar cliente',
    submit: 'Guardar cambios',
    redirectingLabel: 'Redirigiendo',
    loading: 'Cargando',
    notFound: 'Cliente no encontrado.',
    loadError: 'No se pudo cargar este cliente.',
  },
} as const;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not_found' }
  | { kind: 'ready'; client: ClientRow };

export default function EditClientPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params?.id;
  const gate = useTribeOSPremiumGate();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    if (!clientId) return;
    // Short-circuit obviously-bad params (e.g. someone typed
    // /os/clients/[id]/edit literally, or hit a route where the
    // upstream link forgot to interpolate). Without this guard
    // the value reaches Postgres and surfaces as a raw
    // "invalid input syntax for type uuid" error.
    if (!isValidUuid(clientId)) {
      setState({ kind: 'not_found' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const res = await fetch(`/api/tribe-os/clients/${clientId}/`, { method: 'GET' });
        if (res.status === 404) {
          if (!cancelled) setState({ kind: 'not_found' });
          return;
        }
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: DetailResponse;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error', message: body.error || s.loadError });
          return;
        }
        setState({ kind: 'ready', client: body.data.client });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: s.loadError });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gate.state, clientId, s.loadError]);

  if (gate.state !== 'allowed') {
    return (
      <main className="min-h-screen bg-tribe-dark flex items-center justify-center px-4">
        <p className="text-white/70 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : ''}
        </p>
      </main>
    );
  }

  if (state.kind === 'loading') {
    return (
      <main className="min-h-screen bg-tribe-dark text-white flex items-center justify-center px-4">
        <p className="text-sm text-white/60">{s.loading}…</p>
      </main>
    );
  }

  if (state.kind === 'not_found') {
    return (
      <main className="min-h-screen bg-tribe-dark text-white flex items-center justify-center px-4">
        <p className="text-sm text-white/60">{s.notFound}</p>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="min-h-screen bg-tribe-dark text-white flex items-center justify-center px-4">
        <p className="text-sm text-white/60">{state.message}</p>
      </main>
    );
  }

  const c = state.client;

  return (
    <ClientForm
      title={s.title}
      submitLabel={s.submit}
      cancelHref={`/os/clients/${c.id}`}
      initialValues={{
        name: c.name,
        email: c.email ?? '',
        phone: c.phone ?? '',
        notes: c.notes ?? '',
        tags: c.tags.join(', '),
        status: c.status,
        health_notes: c.health_notes ?? '',
      }}
      onSubmit={async (cleaned) => {
        const res = await fetch(`/api/tribe-os/clients/${c.id}/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleaned),
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
        };
        if (!res.ok || !body.success) {
          return { success: false, error: body.error || 'update_failed' };
        }
        trackEvent('tribe_os_client_updated', {
          status: cleaned.status,
          // Aggregate signal — which categories of field were touched
          // without leaking their values
          changed_status: cleaned.status !== c.status,
          changed_health_notes: (cleaned.health_notes ?? '') !== (c.health_notes ?? ''),
          changed_tags: cleaned.tags.join(',') !== c.tags.join(','),
        });
        if (cleaned.status !== c.status) {
          trackEvent('tribe_os_client_status_changed', {
            from: c.status,
            to: cleaned.status,
          });
        }
        router.push(`/os/clients/${c.id}`);
        return { success: true };
      }}
    />
  );
}
