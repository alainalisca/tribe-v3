'use client';

/**
 * "Export attendance" button on the revenue dashboard.
 *
 * Companion to the existing revenue ExportButton. Both download CSVs
 * scoped to the same period — payments + attendance reconcile any
 * "did this person actually train on the day they paid?" question
 * accountants and gym owners hit at tax season.
 *
 * The endpoint streams back text/csv with Content-Disposition; we
 * trigger the download via an ephemeral anchor (same pattern as
 * ExportButton, more reliable across browsers than window.location).
 */

import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { showError } from '@/lib/toast';
import { trackEvent } from '@/lib/analytics';
import type { Period } from '../_lib/periods';

interface Props {
  period: Period;
}

export default function AttendanceExportButton({ period }: Props): JSX.Element {
  const { language } = useLanguage();
  const s = COPY[language];
  const [generating, setGenerating] = useState<boolean>(false);

  const handleExport = async (): Promise<void> => {
    if (generating) return;
    setGenerating(true);
    try {
      // Date params line up with the revenue export: from/to are
      // YYYY-MM-DD strings the route parses into ISO. Same period
      // → same date range so the two CSVs cover an identical window.
      const url = `/api/tribe-os/attendance/export?from=${period.from}&to=${period.to}`;
      const res = await fetch(url, { headers: { Accept: 'text/csv' } });
      if (!res.ok) {
        let msg: string = s.errorGeneric;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error === 'premium_required') msg = s.errorPremiumRequired;
          else if (body.error === 'unauthorized') msg = s.errorUnauthorized;
          else if (body.error === 'invalid_date_range') msg = s.errorInvalidRange;
        } catch {
          // Keep the generic message on parse failure.
        }
        showError(msg);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const filename = `tribe-os-attendance-${period.from}-${period.to}.csv`;
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      trackEvent('tribe_os_attendance_exported', {
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
      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <ClipboardCheck className="w-3.5 h-3.5" />
      {generating ? s.generating : s.label}
    </button>
  );
}

const COPY = {
  en: {
    label: 'Export attendance',
    generating: 'Generating…',
    errorGeneric: 'Could not generate the CSV. Please try again.',
    errorNetwork: 'Could not reach the server. Try again.',
    errorPremiumRequired: 'Tribe.OS premium is required to export.',
    errorUnauthorized: 'You need to sign in to export.',
    errorInvalidRange: 'That date range looks off — pick a different period.',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    label: 'Exportar asistencias',
    generating: 'Generando…',
    errorGeneric: 'No se pudo generar el CSV. Intenta de nuevo.',
    errorNetwork: 'No se pudo conectar al servidor. Intenta de nuevo.',
    errorPremiumRequired: 'Se requiere Tribe.OS premium para exportar.',
    errorUnauthorized: 'Necesitas iniciar sesión para exportar.',
    errorInvalidRange: 'El rango de fechas no es válido. Elige otro período.',
  },
} as const;
