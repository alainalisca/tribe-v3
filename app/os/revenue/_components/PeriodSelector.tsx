'use client';

/**
 * Pill-style period selector for the revenue dashboard.
 *
 * Six preset pills (this week → all time) and a "Custom" toggle that
 * reveals two date inputs. Validation is inline:
 *   - `to` must be on or after `from`
 *   - range cannot exceed 366 days (matches the API cap)
 * Validation errors render below the inputs without firing the change
 * callback.
 *
 * The parent (page.tsx) owns the Period state. This component reads
 * `value.preset` to decide which pill is highlighted.
 */

import { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import {
  thisWeekPeriod,
  thisMonthPeriod,
  lastMonthPeriod,
  last3MonthsPeriod,
  ytdPeriod,
  allTimePeriod,
  customPeriod,
  type Period,
  type PresetKey,
} from '../_lib/periods';

const MAX_RANGE_DAYS = 366;

interface Props {
  value: Period;
  onChange: (next: Period) => void;
  timezone: string;
}

export default function PeriodSelector({ value, onChange, timezone }: Props): JSX.Element {
  const { language } = useLanguage();
  const s = COPY[language];

  const [customOpen, setCustomOpen] = useState<boolean>(value.preset === 'custom');
  const [customFrom, setCustomFrom] = useState<string>(value.from);
  const [customTo, setCustomTo] = useState<string>(value.to);
  const [customError, setCustomError] = useState<string | null>(null);

  const handlePreset = (preset: PresetKey) => {
    let next: Period | null = null;
    switch (preset) {
      case 'this_week':
        next = thisWeekPeriod(timezone, language);
        break;
      case 'this_month':
        next = thisMonthPeriod(timezone, language);
        break;
      case 'last_month':
        next = lastMonthPeriod(timezone, language);
        break;
      case 'last_3_months':
        next = last3MonthsPeriod(timezone, language);
        break;
      case 'ytd':
        next = ytdPeriod(timezone, language);
        break;
      case 'all_time':
        next = allTimePeriod(timezone, language);
        break;
      case 'custom':
        setCustomOpen(true);
        return;
    }
    if (next) {
      setCustomOpen(false);
      setCustomError(null);
      onChange(next);
    }
  };

  const handleCustomApply = () => {
    // Validate
    if (!customFrom || !customTo) {
      setCustomError(s.errorMissingDate);
      return;
    }
    if (customTo < customFrom) {
      setCustomError(s.errorOrder);
      return;
    }
    const fromMs = new Date(`${customFrom}T00:00:00Z`).getTime();
    const toMs = new Date(`${customTo}T00:00:00Z`).getTime();
    const spanDays = Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000)) + 1;
    if (spanDays > MAX_RANGE_DAYS) {
      setCustomError(s.errorTooLong(MAX_RANGE_DAYS, spanDays));
      return;
    }
    setCustomError(null);
    onChange(customPeriod(customFrom, customTo, language));
  };

  const presets: Array<{ key: PresetKey; label: string }> = [
    { key: 'this_week', label: s.thisWeek },
    { key: 'this_month', label: s.thisMonth },
    { key: 'last_month', label: s.lastMonth },
    { key: 'last_3_months', label: s.last3Months },
    { key: 'ytd', label: s.ytd },
    { key: 'all_time', label: s.allTime },
    { key: 'custom', label: s.custom },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {presets.map(({ key, label }) => {
          const active = value.preset === key || (key === 'custom' && customOpen);
          return (
            <button
              key={key}
              type="button"
              onClick={() => handlePreset(key)}
              className={
                active
                  ? 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-tribe-green text-tribe-dark transition-colors'
                  : 'px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors'
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {customOpen && (
        <div className="mt-4 rounded-xl bg-white border border-gray-200 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {s.from}
              </label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 text-tribe-dark text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{s.to}</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-gray-300 text-tribe-dark text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleCustomApply}
              className="inline-flex items-center justify-center px-4 py-2 bg-tribe-green text-tribe-dark text-sm font-bold rounded-lg hover:-translate-y-0.5 transition-transform"
            >
              {s.apply}
            </button>
          </div>
          {customError && (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {customError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const COPY = {
  en: {
    thisWeek: 'This week',
    thisMonth: 'This month',
    lastMonth: 'Last month',
    last3Months: 'Last 3 months',
    ytd: 'Year to date',
    allTime: 'All time',
    custom: 'Custom',
    from: 'From',
    to: 'To',
    apply: 'Apply',
    errorMissingDate: 'Please select both dates.',
    errorOrder: 'The end date must be on or after the start date.',
    errorTooLong: (max: number, got: number) => `Date range cannot exceed ${max} days (got ${got}).`,
  },
  // ES PENDING VERONICA REVIEW
  es: {
    thisWeek: 'Esta semana',
    thisMonth: 'Este mes',
    lastMonth: 'Mes pasado',
    last3Months: 'Últimos 3 meses',
    ytd: 'Año en curso',
    allTime: 'Todo el tiempo',
    custom: 'Personalizado',
    from: 'Desde',
    to: 'Hasta',
    apply: 'Aplicar',
    errorMissingDate: 'Por favor selecciona ambas fechas.',
    errorOrder: 'La fecha final debe ser igual o posterior a la inicial.',
    errorTooLong: (max: number, got: number) => `El rango de fechas no puede exceder ${max} días (recibido: ${got}).`,
  },
} as const;
