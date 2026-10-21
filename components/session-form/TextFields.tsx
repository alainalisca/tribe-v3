'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/LanguageContext';

interface TextFieldProps {
  value: string;
  onChange: (next: string) => void;
}

export function JoinPolicySelect({ value, onChange }: TextFieldProps) {
  const { t } = useLanguage();
  return (
    <div>
      <Label className="text-theme-primary mb-2">{t('joinPolicy')}</Label>
      <select
        name="join_policy"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
      >
        <option value="open">{t('openJoinPolicy')}</option>
        <option value="curated">{t('curatedJoinPolicy')}</option>
        <option value="invite_only">{t('inviteOnlyJoinPolicy')}</option>
      </select>
    </div>
  );
}

export function DescriptionField({ value, onChange }: TextFieldProps) {
  const { t } = useLanguage();
  return (
    <div>
      <Label className="text-theme-primary mb-2">{t('description')}</Label>
      <Textarea
        name="description"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder={t('describeSession')}
        className="py-3 border-theme bg-theme-card text-theme-primary resize-none"
      />
    </div>
  );
}

export function EquipmentField({ value, onChange }: TextFieldProps) {
  const { t } = useLanguage();
  return (
    <div>
      <Label className="text-theme-primary mb-2">🎒 {t('equipment')}</Label>
      <Input
        type="text"
        name="equipment"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('equipmentPlaceholder')}
        className="h-auto py-3 border-theme bg-theme-card text-theme-primary"
      />
    </div>
  );
}
