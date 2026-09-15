'use client';

import { sportTranslations } from '@/lib/translations';
import type { TranslationKey } from '@/lib/translations';
import { useTranslations } from '@/lib/i18n/useTranslations';

interface FilterSelectsProps {
  selectedSport: string;
  setSelectedSport: (s: string) => void;
  dateFilter: string;
  setDateFilter: (d: string) => void;
  genderFilter: string;
  setGenderFilter: (g: string) => void;
  pricingFilter: string;
  setPricingFilter: (p: string) => void;
  language: 'en' | 'es';
  t: (key: TranslationKey) => string;
}

const SELECT_CLASS =
  'w-full p-2.5 bg-white dark:bg-tribe-card border border-stone-300 dark:border-tribe-mid rounded-lg text-stone-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-tribe-green text-sm';

/**
 * The four feed filters, kept as native selects on purpose: iOS renders them
 * as a wheel picker, which beats any custom dropdown on a phone.
 *
 * Gender and price name themselves in their placeholder ("Gender: All" rather
 * than a bare "All"); side by side, two selects both reading "All" gave no
 * clue which was which without opening them.
 */
export default function FilterSelects({
  selectedSport,
  setSelectedSport,
  dateFilter,
  setDateFilter,
  genderFilter,
  setGenderFilter,
  pricingFilter,
  setPricingFilter,
  language,
  t,
}: FilterSelectsProps) {
  const tr = useTranslations('home');
  const sports = Object.keys(sportTranslations);

  return (
    <div className="grid grid-cols-4 gap-2">
      <select value={selectedSport} onChange={(e) => setSelectedSport(e.target.value)} className={SELECT_CLASS}>
        <option value="">{t('sport')}</option>
        {sports.map((sport) => (
          <option key={sport} value={sport}>
            {language === 'es' ? sportTranslations[sport]?.es || sport : sport}
          </option>
        ))}
      </select>

      <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={SELECT_CLASS}>
        <option value="all">{t('date')}</option>
        <option value="today">{t('today')}</option>
        <option value="week">{t('week')}</option>
        <option value="month">{t('month')}</option>
      </select>

      <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} className={SELECT_CLASS}>
        <option value="all">{tr('genderAll')}</option>
        <option value="women_only">{t('women')}</option>
        <option value="men_only">{t('men')}</option>
      </select>

      <select value={pricingFilter} onChange={(e) => setPricingFilter(e.target.value)} className={SELECT_CLASS}>
        <option value="all">{tr('priceAll')}</option>
        <option value="free">{tr('filterFree')}</option>
        <option value="paid">{tr('filterPaid')}</option>
      </select>
    </div>
  );
}
