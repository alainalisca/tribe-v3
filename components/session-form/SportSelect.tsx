'use client';

import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations, translateSport } from '@/lib/translations';
import { ERROR_TEXT } from './fieldStyles';

const SPORTS = Object.keys(sportTranslations).filter((s) => s !== 'All');

interface SportSelectProps {
  value: string;
  onChange: (sport: string) => void;
  error?: string;
}

/**
 * The sport picker. A session saved before the list had its sport (the edit
 * page used to take free text) keeps that value as an extra option, so opening
 * the form never silently changes it.
 */
export default function SportSelect({ value, onChange, error }: SportSelectProps) {
  const { t, language } = useLanguage();
  const options = value && !SPORTS.includes(value) ? [value, ...SPORTS] : SPORTS;
  return (
    <div>
      <Label className="text-theme-primary mb-2">{t('sport')} *</Label>
      <select
        name="sport"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full p-3 border rounded-lg bg-theme-card text-theme-primary ${error ? 'border-red-500' : 'border-theme'}`}
      >
        <option value="">{t('selectSport')}</option>
        {options.map((sport) => (
          <option key={sport} value={sport}>
            {translateSport(sport, language)}
          </option>
        ))}
      </select>
      {error && <p className={ERROR_TEXT}>{error}</p>}
    </div>
  );
}
