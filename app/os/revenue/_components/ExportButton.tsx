'use client';

/**
 * "Export CSV" button for the revenue dashboard.
 *
 * Triggers a browser download of /api/tribe-os/revenue/export for the
 * current period. The endpoint streams back a CSV with Content-Disposition
 * set, so the browser handles the file save.
 *
 * On iOS Safari the download may surface as a share sheet instead of
 * a direct save — that's standard iOS behavior and not something we
 * can override from JS. Documented as expected behavior.
 *
 * Idle / generating states are reflected in the button label.
 */

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { showError } from '@/lib/toast';
import { trackEvent } from '@/lib/analytics';
import type { Period } from '../_lib/periods';

interface Props {
  period: Period;
}

export default function ExportButton({ period }: Props): JSX.Element {
  const { language } = useLanguage();
  const s = COPY[language];
  const [generating, setGenerating] = useState<boolean>(false);

  const handleExport = async (): Promise<void> => {
    if (generating) return;
    setGenerating(true);
    try {
      const url = `/api/tribe-os/revenue/export?from=${period.from}&to=${period.to}&format=csv`;
      const res = await fetch(url, { headers: { Accept: 'text/csv' } });
      if (!res.ok) {
        // If the server rejected, try to extract the error message.
        let msg: string = s.errorGeneric;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error === 'premium_required') msg = s.errorPremiumRequired;
          else if (body.error === 'unauthorized') msg = s.errorUnauthorized;
        } catch {
          // Ignore JSON parse failures — keep the generic message.
        }
        showError(msg);
        return;
      }
      // Read the CSV body, build a blob, trigger a download via an
      // ephemeral anchor element. More reliable across browsers than
      // window.location.href (which can be blocked as a popup).
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const filename = `tribe-os-revenue-${period.from}-${period.to}.csv`;
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      // Free the object URL after a brief delay to let the browser dispatch.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      // Fire on successful download. Period is the only meaningful
      // signal — the CSV contents themselves are private financial data.
      trackEvent('tribe_os_revenue_exported', {
        from: period.from,
        to: period.to,
      });
    } catch {
      showError(s.errorNetwork);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={generating}
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-white/10 text-white/80 hover:bg-white/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Download className="w-3.5 h-3.5" />
      {generating ? s.generating : s.label}
    </button>
  );
}

const COPY = {
  en: {
    label: 'Export CSV',
    generating: 'Generating…',
    errorGeneric: 'Could not generate the CSV. Please try again.',
    errorNetwork: 'Could not reach the server. Try again.',
    errorPremiumRequired: 'Tribe.OS premium is required to export CSV.',
    errorUnauthorized: 'You need to sign in to export.',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    label: 'Exportar CSV',
    generating: 'Generando…',
    errorGeneric: 'No se pudo generar el CSV. Intenta de nuevo.',
    errorNetwork: 'No se pudo conectar al servidor. Intenta de nuevo.',
    errorPremiumRequired: 'Se requiere Tribe.OS premium para exportar CSV.',
    errorUnauthorized: 'Necesitas iniciar sesión para exportar.',
  },
} as const;
