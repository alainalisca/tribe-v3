'use client';

import type { TranslationShape, FormState } from './packagesI18n';

interface PackageFormProps {
  t: TranslationShape;
  language: string;
  form: FormState;
  submitting: boolean;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
}

export function PackageForm({
  t,
  language,
  form,
  submitting,
  updateField,
  onSubmit,
  onCancel,
}: PackageFormProps): React.JSX.Element {
  return (
    <div className="bg-white dark:bg-tribe-card rounded-2xl p-5 border border-stone-200 dark:border-gray-700 space-y-4">
      <h2 className="text-lg font-bold text-theme-primary">{t.formTitle}</h2>

      <div>
        <label className="block text-sm font-medium text-theme-primary mb-1">{t.name}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder={t.namePlaceholder}
          className="w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:outline-none focus:border-tribe-green"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-theme-primary mb-1">{t.description}</label>
        <textarea
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder={t.descriptionPlaceholder}
          rows={3}
          className="w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:outline-none focus:border-tribe-green resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-theme-primary mb-1">{t.priceCents}</label>
          <input
            type="number"
            value={form.priceCents}
            onChange={(e) => updateField('priceCents', e.target.value)}
            placeholder={t.pricePlaceholder}
            min="1"
            className="w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:outline-none focus:border-tribe-green"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-theme-primary mb-1">{t.currency}</label>
          <select
            value={form.currency}
            onChange={(e) => updateField('currency', e.target.value as 'COP' | 'USD')}
            className="w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-lg px-4 py-3 text-theme-primary focus:outline-none focus:border-tribe-green"
          >
            <option value="COP">COP</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-theme-primary mb-1">{t.packageType}</label>
        <select
          value={form.packageType}
          onChange={(e) => updateField('packageType', e.target.value as 'session_pack' | 'membership' | 'custom')}
          className="w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-lg px-4 py-3 text-theme-primary focus:outline-none focus:border-tribe-green"
        >
          <option value="session_pack">{t.sessionPack}</option>
          <option value="membership">{t.membership}</option>
          <option value="custom">{t.custom}</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-theme-primary mb-1">{t.sessionCount}</label>
          <input
            type="number"
            value={form.sessionCount}
            onChange={(e) => updateField('sessionCount', e.target.value)}
            placeholder="10"
            min="1"
            className="w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:outline-none focus:border-tribe-green"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-theme-primary mb-1">{t.durationDays}</label>
          <input
            type="number"
            value={form.durationDays}
            onChange={(e) => updateField('durationDays', e.target.value)}
            placeholder="30"
            min="1"
            className="w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:outline-none focus:border-tribe-green"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-theme-primary mb-1">{t.tag}</label>
        <input
          type="text"
          value={form.tag}
          onChange={(e) => updateField('tag', e.target.value)}
          placeholder={t.tagPlaceholder}
          className="w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:outline-none focus:border-tribe-green"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="flex-1 bg-tribe-green text-slate-900 disabled:bg-tribe-green/50 font-semibold rounded-xl py-3 transition"
        >
          {submitting ? (language === 'es' ? 'Creando…' : 'Creating…') : t.create}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300 rounded-xl py-3 font-semibold transition"
        >
          {t.cancel}
        </button>
      </div>
    </div>
  );
}
