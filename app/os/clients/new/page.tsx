'use client';

import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import ClientForm from '@/components/tribe-os/ClientForm';
import type { ClientRow } from '@/lib/dal/clients';

const copy = {
  en: {
    title: 'New client',
    submit: 'Create client',
    redirectingLabel: 'Redirecting',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    title: 'Nuevo cliente',
    submit: 'Crear cliente',
    redirectingLabel: 'Redirigiendo',
  },
} as const;

export default function NewClientPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const router = useRouter();
  const gate = useTribeOSPremiumGate();

  if (gate.state !== 'allowed') {
    return (
      <main className="min-h-screen bg-tribe-dark flex items-center justify-center px-4">
        <p className="text-white/70 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : ''}
        </p>
      </main>
    );
  }

  return (
    <ClientForm
      title={s.title}
      submitLabel={s.submit}
      cancelHref="/os/clients"
      onSubmit={async (cleaned) => {
        const res = await fetch('/api/tribe-os/clients/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleaned),
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: ClientRow;
          error?: string;
        };
        if (!res.ok || !body.success || !body.data) {
          return { success: false, error: body.error || 'create_failed' };
        }
        router.push(`/os/clients/${body.data.id}`);
        return { success: true };
      }}
    />
  );
}
