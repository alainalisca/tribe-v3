'use client';

import { Label } from '@/components/ui/label';
import { DateTimeInput } from '@/components/ui/date-time-input';
import { useLanguage } from '@/lib/LanguageContext';
import { ERROR_TEXT } from './fieldStyles';

interface DateTimeFieldsProps {
  date: string;
  startTime: string;
  onDateChange: (date: string) => void;
  onStartTimeChange: (time: string) => void;
  /**
   * The earliest date the native picker offers. Create passes today in Bogotá;
   * edit passes nothing, because a recurring parent's own date is in the past
   * by design and a native `min` would refuse to submit it.
   */
  minDate?: string;
  dateError?: string;
  startTimeError?: string;
}

export default function DateTimeFields({
  date,
  startTime,
  onDateChange,
  onStartTimeChange,
  minDate,
  dateError,
  startTimeError,
}: DateTimeFieldsProps) {
  const { t } = useLanguage();
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <Label className="text-theme-primary mb-2">{t('date')} *</Label>
        <DateTimeInput
          type="date"
          name="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          min={minDate}
          className={`h-auto py-3 bg-theme-card text-theme-primary ${dateError ? 'border-red-500' : 'border-theme'}`}
        />
        {dateError && <p className={ERROR_TEXT}>{dateError}</p>}
      </div>
      <div>
        <Label className="text-theme-primary mb-2">{t('startTime')} *</Label>
        <DateTimeInput
          type="time"
          name="start_time"
          value={startTime}
          onChange={(e) => onStartTimeChange(e.target.value)}
          className={`h-auto py-3 bg-theme-card text-theme-primary ${startTimeError ? 'border-red-500' : 'border-theme'}`}
        />
        {startTimeError && <p className={ERROR_TEXT}>{startTimeError}</p>}
      </div>
    </div>
  );
}
