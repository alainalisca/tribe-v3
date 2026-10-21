'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/LanguageContext';
import { MAX_ATHLETES, MIN_ATHLETES } from '@/lib/sessions/sessionFormRules';
import { ERROR_TEXT } from './fieldStyles';

interface CapacityInputProps {
  /** '' while the box is empty, so typing "12" never snaps through a default. */
  value: number | '';
  onChange: (next: number | '') => void;
  error?: string;
}

/** sessions.max_participants. The bounds are the rules module's, the same as 227's CHECK. */
export default function CapacityInput({ value, onChange, error }: CapacityInputProps) {
  const { t } = useLanguage();
  return (
    <div>
      <Label className="text-theme-primary mb-2">{t('maxParticipants')}</Label>
      <Input
        type="number"
        name="max_participants"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        min={MIN_ATHLETES}
        max={MAX_ATHLETES}
        className={`h-auto py-3 bg-theme-card text-theme-primary ${error ? 'border-red-500' : 'border-theme'}`}
      />
      {error && <p className={ERROR_TEXT}>{error}</p>}
    </div>
  );
}
