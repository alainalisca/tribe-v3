'use client';

import { AlertCircle, DollarSign } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { formatCents } from '@/lib/format/currency';

export interface PlanRowState {
  name: string;
  priceDisplay: string;
  durationMonths: number;
  dirty: boolean;
  error: string | null;
  existingPlanId: string | null;
  existingPriceCents: number | null;
  existingDuration: number | null;
}

const DURATION_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1);

const NAME_DURATION_MAP: Record<string, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

export function inferDurationFromName(name: string): number {
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
  for (const [keyword, months] of Object.entries(NAME_DURATION_MAP)) {
    if (normalized.includes(keyword)) return months;
  }
  return 1;
}

export function durationMismatchWarning(name: string, chosenMonths: number): string | null {
  const implied = inferDurationFromName(name);
  if (implied === 1) return null;
  if (implied === chosenMonths) return null;
  const inferredKeyword = Object.entries(NAME_DURATION_MAP).find(([, m]) => m === implied)?.[0];
  if (!inferredKeyword) return null;
  const capitalized = inferredKeyword.charAt(0).toUpperCase() + inferredKeyword.slice(1);
  return `¿${capitalized} con ${chosenMonths} mes${chosenMonths > 1 ? 'es' : ''}? Normalmente son ${implied}.`;
}

export function parsePriceInput(display: string): number {
  const cleaned = display.replace(/[^0-9]/g, '');
  if (!cleaned) return 0;
  return parseInt(cleaned, 10) * 100;
}

export function formatPriceForInput(cents: number, currency: string): string {
  const whole = Math.floor(cents / 100);
  if (currency === 'COP') return whole.toLocaleString('es-CO');
  return whole.toLocaleString('en-US');
}

const copy = {
  en: {
    title: 'Plans & pricing',
    subtitle: 'Plan names come from your client import. Enter price and duration to enable revenue forecasting.',
    noPlans: 'No plan names found in your client data yet.',
    readOnly: 'Only the gym owner can edit pricing.',
    monthlyEquiv: '/mo',
    noPriceYet: 'no price',
    months: 'mo',
    unsaved: 'unsaved',
  },
  es: {
    title: 'Planes y precios',
    subtitle: 'Los nombres de plan vienen de tu importación. Ingresa precio y duración para habilitar el pronóstico de ingresos.',
    noPlans: 'Aún no se encontraron nombres de plan en tus datos de clientes.',
    readOnly: 'Solo el propietario del gym puede editar precios.',
    monthlyEquiv: '/mes',
    noPriceYet: 'sin precio',
    months: 'mes',
    unsaved: 'sin guardar',
  },
} as const;

interface Props {
  rows: PlanRowState[];
  gymCurrency: 'COP' | 'USD';
  canEdit: boolean;
  saving: boolean;
  onRowChange: (index: number, partial: Partial<PlanRowState>) => void;
}

export default function GymPlansSection({ rows, gymCurrency, canEdit, saving, onRowChange }: Props) {
  const { language } = useLanguage();
  const s = copy[language];

  if (rows.length === 0) {
    return (
      <div className="pt-4">
        <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">{s.title}</h2>
        <p className="text-sm text-gray-500 italic">{s.noPlans}</p>
      </div>
    );
  }

  return (
    <div className="pt-4">
      <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-1">{s.title}</h2>
      <p className="text-xs text-gray-500 mb-3">{s.subtitle}</p>

      {!canEdit && (
        <div className="flex items-start gap-2 p-2.5 bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-600 mb-3">
          <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
          <span>{s.readOnly}</span>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((row, i) => {
          const warning = durationMismatchWarning(row.name, row.durationMonths);
          const monthlyCents =
            row.existingPriceCents !== null && row.existingDuration !== null && row.existingDuration > 0
              ? Math.floor(row.existingPriceCents / row.existingDuration)
              : null;

          return (
            <div key={row.name} className="p-2.5 rounded-lg bg-white border border-gray-100 space-y-1">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-gray-900 block truncate">
                    {row.name}
                    {row.dirty && (
                      <span className="ml-1.5 text-[10px] font-medium text-amber-600">{s.unsaved}</span>
                    )}
                  </span>
                  {monthlyCents !== null && !row.dirty && (
                    <span className="text-[10px] text-gray-400">
                      {formatCents(monthlyCents, gymCurrency, language)}
                      {s.monthlyEquiv}
                    </span>
                  )}
                  {row.existingPlanId === null && !row.dirty && (
                    <span className="inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 rounded">
                      {s.noPriceYet}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="relative">
                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={row.priceDisplay}
                      onChange={(e) => onRowChange(i, { priceDisplay: e.target.value, dirty: true })}
                      placeholder="0"
                      disabled={!canEdit || saving}
                      className="w-[7.5rem] pl-6 pr-2 py-1.5 text-sm text-right bg-white border border-gray-200 rounded focus:border-tribe-green focus:outline-none disabled:opacity-50 tabular-nums"
                    />
                  </div>

                  <select
                    value={row.durationMonths}
                    onChange={(e) =>
                      onRowChange(i, { durationMonths: parseInt(e.target.value, 10), dirty: true })
                    }
                    disabled={!canEdit || saving}
                    className="w-20 py-1.5 px-1 text-sm bg-white border border-gray-200 rounded focus:border-tribe-green focus:outline-none disabled:opacity-50"
                  >
                    {DURATION_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m} {s.months}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {warning && (
                <p className="text-xs text-amber-600 flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                  {warning}
                </p>
              )}

              {row.error && <p className="text-xs text-red-600">{row.error}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
