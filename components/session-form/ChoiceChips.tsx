'use client';

import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/LanguageContext';
import { DURATIONS } from '@/lib/sessions/sessionFormRules';
import { chipClass } from './fieldStyles';

interface ChipsProps<T> {
  value: T;
  onChange: (next: T) => void;
}

export function SkillLevelChips({ value, onChange }: ChipsProps<string>) {
  const { t } = useLanguage();
  const levels = [
    { value: 'all_levels', label: t('allLevels'), emoji: '🌟' },
    { value: 'beginner', label: t('beginner'), emoji: '🌱' },
    { value: 'intermediate', label: t('intermediate'), emoji: '💪' },
    { value: 'advanced', label: t('advanced'), emoji: '🔥' },
  ];
  return (
    <div data-field="skill_level">
      <Label className="text-theme-primary mb-2">{t('skillLevel')}</Label>
      <div className="grid grid-cols-4 gap-2">
        {levels.map((level) => (
          <button
            key={level.value}
            type="button"
            aria-pressed={value === level.value}
            onClick={() => onChange(level.value)}
            className={`p-3 rounded-lg font-medium transition-all flex flex-col items-center justify-center ${chipClass(value === level.value)}`}
          >
            <div className="text-lg mb-1">{level.emoji}</div>
            <div className="text-xs text-center leading-tight">{level.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** sessions.gender_preference, labelled "Quién puede unirse". */
export function WhoCanJoinChips({ value, onChange }: ChipsProps<string>) {
  const { t } = useLanguage();
  const options = [
    { value: 'all', label: t('allWelcome'), emoji: '👥' },
    { value: 'women_only', label: t('womenOnly'), emoji: '👩' },
    { value: 'men_only', label: t('menOnly'), emoji: '👨' },
  ];
  return (
    <div data-field="gender_preference">
      <Label className="text-theme-primary mb-2">{t('genderPreference')}</Label>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`p-3 rounded-lg font-medium transition-all text-center ${chipClass(value === option.value)}`}
          >
            <div className="text-lg mb-1">{option.emoji}</div>
            <div className="text-xs">{option.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function formatDuration(mins: number): string {
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`;
}

export function DurationChips({ value, onChange }: ChipsProps<number>) {
  const { t } = useLanguage();
  return (
    <div>
      <Label className="text-theme-primary mb-2">
        {t('duration')} ({t('minutes')})
      </Label>
      <div className="grid grid-cols-4 gap-2">
        {DURATIONS.map((mins) => (
          <button
            key={mins}
            type="button"
            aria-pressed={value === mins}
            onClick={() => onChange(mins)}
            className={`p-3 rounded-lg font-medium transition-all ${chipClass(value === mins)}`}
          >
            {formatDuration(mins)}
          </button>
        ))}
      </div>
    </div>
  );
}
