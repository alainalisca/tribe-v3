'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, Check, DollarSign } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { formatCents } from '@/lib/format/currency';

interface GymPlan {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  duration_months: number;
}

interface PlansData {
  plans: GymPlan[];
  clientPlanNames: string[];
  gymCurrency: 'COP' | 'USD';
  isOwner: boolean;
}

type RowState = {
  name: string;
  priceDisplay: string;
  durationMonths: number;
  saving: boolean;
  saved: boolean;
  error: string | null;
  existingPlan: GymPlan | null;
};

const DURATION_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1);

const copy = {
  en: {
    title: 'Plans & pricing',
    subtitle: 'Plan names come from your client import. Enter price and duration to enable revenue forecasting.',
    price: 'Price',
    duration: 'Duration',
    months: 'mo',
    month: 'month',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
    noPlans: 'No plan names found in your client data yet.',
    readOnly: 'Only the gym owner can edit pricing.',
    monthlyEquiv: '/mo',
    noPriceYet: 'no price',
  },
  es: {
    title: 'Planes y precios',
    subtitle: 'Los nombres de plan vienen de tu importación. Ingresa precio y duración para habilitar el pronóstico de ingresos.',
    price: 'Precio',
    duration: 'Duración',
    months: 'mes',
    month: 'mes',
    save: 'Guardar',
    saving: 'Guardando…',
    saved: 'Guardado',
    noPlans: 'Aún no se encontraron nombres de plan en tus datos de clientes.',
    readOnly: 'Solo el propietario del gym puede editar precios.',
    monthlyEquiv: '/mes',
    noPriceYet: 'sin precio',
  },
} as const;

function parsePriceInput(display: string, currency: string): number {
  const cleaned = display.replace(/[^0-9]/g, '');
  if (!cleaned) return 0;
  const value = parseInt(cleaned, 10);
  if (currency === 'COP') return value * 100;
  return value * 100;
}

function formatPriceForInput(cents: number, currency: string): string {
  const whole = Math.floor(cents / 100);
  if (currency === 'COP') {
    return whole.toLocaleString('es-CO');
  }
  return whole.toLocaleString('en-US');
}

export default function GymPlansSection({ canEdit }: { canEdit: boolean }) {
  const { language } = useLanguage();
  const s = copy[language];
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlansData | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tribe-os/gym/plans');
      if (!res.ok) throw new Error('fetch_failed');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const d = json.data as PlansData;
      setData(d);

      const plansByLowerName = new Map(d.plans.map((p) => [p.name.toLowerCase(), p]));

      const newRows: RowState[] = d.clientPlanNames.map((name) => {
        const existing = plansByLowerName.get(name.toLowerCase()) ?? null;
        return {
          name,
          priceDisplay: existing ? formatPriceForInput(existing.price_cents, d.gymCurrency) : '',
          durationMonths: existing?.duration_months ?? 1,
          saving: false,
          saved: false,
          error: null,
          existingPlan: existing,
        };
      });

      setRows(newRows);
    } catch {
      setError('Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function updateRow(index: number, partial: Partial<RowState>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...partial, saved: false } : r)));
  }

  async function saveRow(index: number) {
    const row = rows[index];
    if (!row || !data) return;

    const priceCents = parsePriceInput(row.priceDisplay, data.gymCurrency);
    if (priceCents <= 0) {
      updateRow(index, { error: 'Price must be > 0' });
      return;
    }

    updateRow(index, { saving: true, error: null });

    try {
      const res = await fetch('/api/tribe-os/gym/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: row.name.trim(),
          price_cents: priceCents,
          currency: data.gymCurrency,
          duration_months: row.durationMonths,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        updateRow(index, { saving: false, error: json.error || 'Save failed' });
        return;
      }
      updateRow(index, {
        saving: false,
        saved: true,
        existingPlan: json.data,
        priceDisplay: formatPriceForInput(priceCents, data.gymCurrency),
      });
    } catch {
      updateRow(index, { saving: false, error: 'Network error' });
    }
  }

  if (loading) {
    return (
      <div className="pt-4">
        <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">{s.title}</h2>
        <div className="animate-pulse space-y-2">
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-4">
        <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">{s.title}</h2>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!data || rows.length === 0) {
    return (
      <div className="pt-4">
        <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">{s.title}</h2>
        <p className="text-sm text-gray-500 italic">{s.noPlans}</p>
      </div>
    );
  }

  const effectiveCanEdit = canEdit && data.isOwner;

  return (
    <div className="pt-4">
      <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-1">{s.title}</h2>
      <p className="text-xs text-gray-500 mb-3">{s.subtitle}</p>

      {!effectiveCanEdit && (
        <div className="flex items-start gap-2 p-2.5 bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-600 mb-3">
          <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
          <span>{s.readOnly}</span>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div
            key={row.name}
            className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-gray-100"
          >
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-gray-900 block truncate">{row.name}</span>
              {row.existingPlan && !row.saving && row.durationMonths > 0 && (
                <span className="text-[10px] text-gray-400">
                  {formatCents(
                    Math.floor(row.existingPlan.price_cents / row.existingPlan.duration_months),
                    data.gymCurrency as 'COP' | 'USD',
                    language
                  )}
                  {s.monthlyEquiv}
                </span>
              )}
              {!row.existingPlan && !row.saving && (
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
                  onChange={(e) => updateRow(i, { priceDisplay: e.target.value })}
                  placeholder="0"
                  disabled={!effectiveCanEdit || row.saving}
                  className="w-24 pl-6 pr-2 py-1.5 text-sm bg-white border border-gray-200 rounded focus:border-tribe-green focus:outline-none disabled:opacity-50"
                />
              </div>

              <select
                value={row.durationMonths}
                onChange={(e) => updateRow(i, { durationMonths: parseInt(e.target.value, 10) })}
                disabled={!effectiveCanEdit || row.saving}
                className="w-20 py-1.5 px-1 text-sm bg-white border border-gray-200 rounded focus:border-tribe-green focus:outline-none disabled:opacity-50"
              >
                {DURATION_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} {s.months}
                  </option>
                ))}
              </select>

              {effectiveCanEdit && (
                <button
                  type="button"
                  onClick={() => saveRow(i)}
                  disabled={row.saving || !row.priceDisplay}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-tribe-green text-tribe-dark hover:bg-tribe-green/90 disabled:opacity-50 transition-colors flex items-center gap-1"
                >
                  {row.saving ? (
                    s.saving
                  ) : row.saved ? (
                    <>
                      <Check className="w-3 h-3" /> {s.saved}
                    </>
                  ) : (
                    s.save
                  )}
                </button>
              )}
            </div>

            {row.error && (
              <span className="text-xs text-red-600">{row.error}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
