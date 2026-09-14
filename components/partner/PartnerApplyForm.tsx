'use client';

import { Loader } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';

/**
 * GYM AND STUDIO ONLY (T-GYM4).
 *
 * The column CHECK in 018_featured_partners.sql:8 still permits
 * ('studio','gym','academy','club','independent'), and existing rows are
 * untouched -- this list is the set the FORM is allowed to produce.
 *
 * academy and club are removed because nothing downstream supports them:
 * lib/partnerIdentity.ts:32-35 returns null for anything but gym/studio (so no
 * type line renders at all) and :46 falls back to 'viewGym' (so an academy's
 * CTA reads "Ver gimnasio"). Six more sites hardcode the same pair --
 * app/storefront/[id]/page.tsx:32, StorefrontProfileColumn.tsx:54,
 * GymStorefrontHeader.tsx:44, GymsAndStudiosSection.tsx:53, GymChip.tsx:46 --
 * and ORGANIZATION_TYPES (lib/dal/gymVenue.ts:239) excludes them from gym
 * discovery entirely. An academy would be approved and invisible.
 *
 * independent is removed because partners_public excludes it
 * (163_partner_slug_and_public_view.sql:309), so it has no /g/[slug] page.
 *
 * Widening this list is T-GYM6, and it means fixing those seven sites first.
 */
const BUSINESS_TYPES = [
  { value: 'gym', labelKey: 'typeGym' },
  { value: 'studio', labelKey: 'typeStudio' },
] as const;

const SPECIALTY_OPTIONS = [
  'CrossFit',
  'Yoga',
  'Pilates',
  'Boxing',
  'Salsa',
  'HIIT',
  'Cycling',
  'Swimming',
  'Martial Arts',
  'Functional Training',
  'Weightlifting',
  'Calisthenics',
  'Running',
  'Dance',
];

/** The fields validate() can reject. Optional fields are absent by design. */
export interface PartnerApplyErrors {
  business_name?: string;
  business_type?: string;
  address?: string;
}

export interface PartnerApplyFormProps {
  businessName: string;
  setBusinessName: (v: string) => void;
  businessType: string;
  setBusinessType: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  descriptionEs: string;
  setDescriptionEs: (v: string) => void;
  selectedSpecialties: string[];
  toggleSpecialty: (s: string) => void;
  address: string;
  setAddress: (v: string) => void;
  website: string;
  setWebsite: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  errors: PartnerApplyErrors;
  /** Clears one field's error as soon as the user edits it. */
  clearError: (field: keyof PartnerApplyErrors) => void;
}

export default function PartnerApplyForm(p: PartnerApplyFormProps) {
  const t = useTranslations('gymSignup');

  const baseCls =
    'w-full px-4 py-3 bg-white dark:bg-tribe-surface border rounded-xl text-stone-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-tribe-green';
  // Same invalid treatment as app/create/page.tsx:462 -- a red border on the
  // control plus a message directly under it.
  const cls = (invalid?: string) =>
    `${baseCls} ${invalid ? 'border-red-500' : 'border-stone-200 dark:border-tribe-mid'}`;

  return (
    <form onSubmit={p.onSubmit} className="space-y-4 pb-8" noValidate>
      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-gray-200 mb-1">
          {t('fieldBusinessName')} *
        </label>
        <input
          className={cls(p.errors.business_name)}
          value={p.businessName}
          aria-invalid={!!p.errors.business_name}
          onChange={(e) => {
            p.setBusinessName(e.target.value);
            p.clearError('business_name');
          }}
        />
        {p.errors.business_name && <p className="text-red-500 text-sm mt-1">{p.errors.business_name}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-gray-200 mb-1">
          {t('fieldBusinessType')} *
        </label>
        <select
          className={cls(p.errors.business_type)}
          value={p.businessType}
          aria-invalid={!!p.errors.business_type}
          onChange={(e) => {
            p.setBusinessType(e.target.value);
            p.clearError('business_type');
          }}
        >
          {BUSINESS_TYPES.map((bt) => (
            <option key={bt.value} value={bt.value}>
              {t(bt.labelKey)}
            </option>
          ))}
        </select>
        {p.errors.business_type && <p className="text-red-500 text-sm mt-1">{p.errors.business_type}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-gray-200 mb-1">
          {t('fieldDescriptionEn')}
        </label>
        <textarea className={cls()} rows={3} value={p.description} onChange={(e) => p.setDescription(e.target.value)} />
      </div>

      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-gray-200 mb-1">
          {t('fieldDescriptionEs')}
        </label>
        <textarea
          className={cls()}
          rows={3}
          value={p.descriptionEs}
          onChange={(e) => p.setDescriptionEs(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-gray-200 mb-2">
          {t('fieldSpecialties')}
        </label>
        <div className="flex flex-wrap gap-2">
          {SPECIALTY_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => p.toggleSpecialty(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                p.selectedSpecialties.includes(s)
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-stone-100 dark:bg-tribe-mid text-stone-700 dark:text-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-gray-200 mb-1">
          {t('fieldAddress')} *
        </label>
        <input
          className={cls(p.errors.address)}
          value={p.address}
          aria-invalid={!!p.errors.address}
          onChange={(e) => {
            p.setAddress(e.target.value);
            p.clearError('address');
          }}
        />
        {p.errors.address && <p className="text-red-500 text-sm mt-1">{p.errors.address}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-gray-200 mb-1">
            {t('fieldWebsite')}
          </label>
          <input
            className={cls()}
            value={p.website}
            onChange={(e) => p.setWebsite(e.target.value)}
            placeholder="https://"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-gray-200 mb-1">
            {t('fieldPhone')}
          </label>
          <input className={cls()} value={p.phone} onChange={(e) => p.setPhone(e.target.value)} />
        </div>
      </div>

      {/* Disabled ONLY while the request is in flight. It used to also be
          disabled on an empty business name, which made the button a dead
          control with no explanation -- the user could not tell a missing field
          from a broken app. Validation now answers that in writing. */}
      <button
        type="submit"
        disabled={p.submitting}
        className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-xl text-base hover:bg-lime-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {p.submitting && <Loader className="w-4 h-4 animate-spin" />}
        {t('submitCta')}
      </button>
    </form>
  );
}
