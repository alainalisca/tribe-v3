'use client';

import { Label } from '@/components/ui/label';
import LocationPicker from '@/components/LocationPicker';
import VenuePicker from '@/components/VenuePicker';
import { useLanguage } from '@/lib/LanguageContext';
import type { UseVenuePickerResult } from '@/hooks/useVenuePicker';

interface LocationFieldsProps {
  /** The page's useVenuePicker(). The page commits it after its own save. */
  venue: UseVenuePickerResult;
  disabled?: boolean;
  value: string;
  /** Each page keeps its own coordinate rule (create clears, edit keeps the old pair). */
  onChange: (location: string, coords?: { lat: number; lng: number }) => void;
  error?: string;
}

/** The gym search and the address/map picker, under one "Ubicación" label. */
export default function LocationFields({ venue, disabled, value, onChange, error }: LocationFieldsProps) {
  const { t } = useLanguage();
  return (
    <div data-field="location">
      <Label className="text-theme-primary mb-2">{t('location')} *</Label>
      <VenuePicker
        selected={venue.selected}
        onSelect={venue.select}
        status={venue.status}
        failed={venue.failed}
        disabled={disabled}
      />
      <LocationPicker value={value} onChange={onChange} placeholder={t('locationPlaceholder')} error={error} />
    </div>
  );
}
