'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { Card } from '@/components/ui/card';

interface RecurringValue {
  is_recurring: boolean;
  recurrence_pattern: string;
  recurrence_end_date: string;
}

interface RecurringSessionToggleProps {
  value: RecurringValue;
  onChange: (val: RecurringValue) => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function RecurringSessionToggle({ value, onChange }: RecurringSessionToggleProps) {
  const { language } = useLanguage();
  const isRecurring = value.is_recurring;
  const frequency = value.recurrence_pattern?.split('_')[0] || 'weekly';
  const selectedDays = value.recurrence_pattern?.includes('_') ? value.recurrence_pattern.split('_').slice(1) : [];

  const handleToggle = () => {
    if (isRecurring) {
      onChange({
        is_recurring: false,
        recurrence_pattern: '',
        recurrence_end_date: '',
      });
    } else {
      onChange({
        is_recurring: true,
        recurrence_pattern: 'weekly_0',
        recurrence_end_date: '',
      });
    }
  };

  const handleFrequencyChange = (freq: string) => {
    const newPattern = freq === 'monthly' ? freq : `${freq}_${selectedDays.join('_') || '0'}`;
    onChange({
      ...value,
      recurrence_pattern: newPattern,
    });
  };

  const handleDayToggle = (dayIndex: number) => {
    const dayStr = String(dayIndex);
    let newDays: string[];

    if (selectedDays.includes(dayStr)) {
      newDays = selectedDays.filter((d) => d !== dayStr);
    } else {
      newDays = [...selectedDays, dayStr];
    }

    if (newDays.length === 0) {
      newDays = ['0'];
    }

    const newPattern = `${frequency}_${newDays.join('_')}`;
    onChange({
      ...value,
      recurrence_pattern: newPattern,
    });
  };

  const handleEndDateChange = (date: string) => {
    onChange({
      ...value,
      recurrence_end_date: date,
    });
  };

  const getPreviewText = (): string => {
    if (!isRecurring) return '';

    const frequencyText =
      language === 'es'
        ? { weekly: 'cada semana', biweekly: 'cada dos semanas', monthly: 'cada mes' }
        : { weekly: 'every week', biweekly: 'every two weeks', monthly: 'every month' };

    const freqLabel = frequencyText[frequency as keyof typeof frequencyText] || frequencyText.weekly;

    let daysText = '';
    if (frequency !== 'monthly' && selectedDays.length > 0) {
      const dayLabels = language === 'es' ? DAYS_ES : DAYS;
      const dayNames = selectedDays
        .map((d) => dayLabels[parseInt(d)])
        .sort((a, b) => dayLabels.indexOf(a) - dayLabels.indexOf(b))
        .join(', ');
      daysText = language === 'es' ? ` los ${dayNames}` : ` on ${dayNames}`;
    }

    const endText =
      value.recurrence_end_date && value.recurrence_end_date.trim()
        ? language === 'es'
          ? ` hasta el ${new Date(value.recurrence_end_date + 'T00:00:00').toLocaleDateString('es-ES', { month: 'long', day: 'numeric' })}`
          : ` until ${new Date(value.recurrence_end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
        : '';

    if (language === 'es') {
      return `Esta sesión se repetirá ${freqLabel}${daysText}${endText}`;
    } else {
      return `This session will repeat ${freqLabel}${daysText}${endText}`;
    }
  };

  return (
    <div className="space-y-4">
      {/* Toggle Button */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-stone-900 dark:text-white">
          {language === 'es' ? 'Sesión Recurrente' : 'Recurring Session'}
        </label>
        <button
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isRecurring ? 'bg-tribe-green' : 'bg-stone-300 dark:bg-tribe-mid'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isRecurring ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Recurring Options */}
      {isRecurring && (
        <Card className="bg-white dark:bg-tribe-card border-stone-200 dark:border-tribe-mid p-4 space-y-4">
          {/* Frequency Selector */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-gray-300 mb-2">
              {language === 'es' ? 'Frecuencia' : 'Frequency'}
            </label>
            <div className="flex gap-2">
              {['weekly', 'biweekly', 'monthly'].map((freq) => (
                <button
                  key={freq}
                  onClick={() => handleFrequencyChange(freq)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${
                    frequency === freq
                      ? 'bg-tribe-green text-slate-900'
                      : 'bg-stone-100 dark:bg-tribe-mid text-stone-700 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-tribe-surface'
                  }`}
                >
                  {language === 'es'
                    ? { weekly: 'Semanal', biweekly: 'Biweekly', monthly: 'Mensual' }[freq]
                    : { weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly' }[freq]}
                </button>
              ))}
            </div>
          </div>

          {/* Day Selector (for Weekly/Biweekly) */}
          {frequency !== 'monthly' && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-gray-300 mb-2">
                {language === 'es' ? 'Días de la Semana' : 'Days of Week'}
              </label>
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((day, idx) => {
                  const dayLabel = language === 'es' ? DAYS_ES[idx] : day;
                  const isSelected = selectedDays.includes(String(idx));
                  return (
                    <button
                      key={idx}
                      onClick={() => handleDayToggle(idx)}
                      className={`py-2 text-xs font-semibold rounded transition-colors ${
                        isSelected
                          ? 'bg-tribe-green text-slate-900'
                          : 'bg-stone-100 dark:bg-tribe-mid text-stone-700 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-tribe-surface'
                      }`}
                    >
                      {dayLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* End Date Picker */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-gray-300 mb-2">
              {language === 'es' ? 'Fecha de Término (Opcional)' : 'End Date (Optional)'}
            </label>
            <input
              type="date"
              value={value.recurrence_end_date}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 dark:border-tribe-mid rounded-lg bg-white dark:bg-tribe-mid text-stone-900 dark:text-white text-sm focus:ring-2 focus:ring-tribe-green focus:border-transparent"
            />
          </div>

          {/* Preview Text */}
          {getPreviewText() && (
            <div className="p-3 bg-stone-50 dark:bg-tribe-mid rounded-lg border-l-4 border-tribe-green">
              <p className="text-sm text-stone-700 dark:text-gray-200 italic">{getPreviewText()}</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
