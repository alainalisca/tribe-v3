'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import LocationPicker from '@/components/LocationPicker';
import { sportTranslations } from '@/lib/translations';
import { useLanguage } from '@/lib/LanguageContext';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { CommunityEditableFields } from '@/lib/dal/communities';
import { buildCommunityPatch, draftFromCommunity, type CommunityEditDraft } from '@/lib/communityEditDiff';

const inputClass =
  'w-full px-4 py-3 bg-stone-100 dark:bg-tribe-mid rounded-lg border border-stone-200 dark:border-tribe-card text-theme-primary placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent';

export interface CommunityEditFormProps {
  /** The loaded row. The form cannot exist without it, so it cannot save without it. */
  initial: CommunityEditableFields;
  /** Receives only the changed columns. Resolves to an error message, or null on success. */
  onSave: (patch: Partial<CommunityEditableFields>) => Promise<string | null>;
  onCancel: () => void;
}

export default function CommunityEditForm({ initial, onSave, onCancel }: CommunityEditFormProps) {
  const { language } = useLanguage();
  const t = useTranslations('communityEdit');
  const [draft, setDraft] = useState<CommunityEditDraft>(() => draftFromCommunity(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = useMemo(() => buildCommunityPatch(initial, draft), [initial, draft]);
  const hasChanges = Object.keys(patch).length > 0;
  const nameMissing = !draft.name.trim();

  const sportOptions = useMemo(
    () =>
      Object.entries(sportTranslations)
        .filter(([key]) => key !== 'All')
        .map(([key, value]) => ({ key, label: value[language] })),
    [language]
  );

  function set<K extends keyof CommunityEditDraft>(key: K, value: CommunityEditDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  // LocationPicker reports coordinates only when a place is picked from the
  // suggestions or the map. Typing alone gives a name with no coordinates, so
  // the old pin is dropped rather than left pointing at the previous place,
  // unless the text is back to exactly the saved name.
  function handleLocation(location: string, coords?: { lat: number; lng: number }) {
    setDraft((prev) => {
      if (coords) return { ...prev, location_name: location, location_lat: coords.lat, location_lng: coords.lng };
      if (location.trim() === (initial.location_name ?? '').trim()) {
        return {
          ...prev,
          location_name: location,
          location_lat: initial.location_lat,
          location_lng: initial.location_lng,
        };
      }
      return { ...prev, location_name: location, location_lat: null, location_lng: null };
    });
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !hasChanges) return;
    if (nameMissing) {
      setError(t('nameRequired'));
      return;
    }
    setSaving(true);
    const message = await onSave(patch);
    setSaving(false);
    if (message) setError(message);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="community-name" className="block text-sm font-semibold text-theme-primary">
          {t('name')}
        </label>
        <input
          id="community-name"
          type="text"
          value={draft.name}
          maxLength={120}
          onChange={(e) => set('name', e.target.value)}
          className={inputClass}
        />
        {nameMissing && <p className="text-red-500 text-sm">{t('nameRequired')}</p>}
      </div>

      <div className="space-y-2">
        <label htmlFor="community-description" className="block text-sm font-semibold text-theme-primary">
          {t('description')}
        </label>
        <textarea
          id="community-description"
          placeholder={t('descriptionPlaceholder')}
          value={draft.description}
          onChange={(e) => set('description', e.target.value)}
          rows={4}
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="community-sport" className="block text-sm font-semibold text-theme-primary">
          {t('sport')}
        </label>
        <select
          id="community-sport"
          value={draft.sport}
          onChange={(e) => set('sport', e.target.value)}
          className={inputClass}
        >
          <option value="">-- {t('none')} --</option>
          {/* A sport saved before the canonical list existed stays selectable,
              so opening the form never silently changes it. */}
          {draft.sport && !sportOptions.some((s) => s.key === draft.sport) && (
            <option value={draft.sport}>{draft.sport}</option>
          )}
          {sportOptions.map((sport) => (
            <option key={sport.key} value={sport.key}>
              {sport.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <span className="block text-sm font-semibold text-theme-primary">{t('location')}</span>
        <LocationPicker value={draft.location_name} onChange={handleLocation} placeholder={t('locationPlaceholder')} />
      </div>

      <div className="space-y-3 bg-stone-50 dark:bg-tribe-surface p-4 rounded-lg">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.is_private}
            onChange={(e) => set('is_private', e.target.checked)}
            className="w-5 h-5 rounded accent-tribe-green"
          />
          <span className="font-medium text-theme-primary">{t('isPrivate')}</span>
        </label>
        <p className="text-xs text-stone-600 dark:text-gray-400 ml-8">{t('isPrivateDesc')}</p>
      </div>

      {error && (
        <p role="alert" className="text-red-500 text-sm">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 h-12 rounded-lg border border-stone-300 dark:border-tribe-card text-theme-primary font-semibold disabled:opacity-60"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={saving || !hasChanges || nameMissing}
          title={!hasChanges ? t('noChanges') : undefined}
          className="flex-1 h-12 rounded-lg bg-tribe-green text-slate-900 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving && <Loader2 className="w-5 h-5 animate-spin" />}
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  );
}
