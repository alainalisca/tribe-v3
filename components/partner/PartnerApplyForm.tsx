'use client';

import { Loader } from 'lucide-react';

const BUSINESS_TYPES = [
  { value: 'studio', en: 'Studio', es: 'Estudio' },
  { value: 'gym', en: 'Gym', es: 'Gimnasio' },
  { value: 'academy', en: 'Academy', es: 'Academia' },
  { value: 'club', en: 'Club', es: 'Club' },
  { value: 'independent', en: 'Independent', es: 'Independiente' },
];

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

export interface PartnerApplyFormProps {
  language: string;
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
}

export default function PartnerApplyForm(p: PartnerApplyFormProps) {
  const t = (en: string, es: string) => (p.language === 'es' ? es : en);
  const inputCls =
    'w-full px-4 py-3 bg-white dark:bg-tribe-surface border border-stone-200 dark:border-[#52575D] rounded-xl text-stone-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-tribe-green';

  return (
    <form onSubmit={p.onSubmit} className="space-y-4 pb-8">
      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-[#E0E0E0] mb-1">
          {t('Business Name', 'Nombre del Negocio')} *
        </label>
        <input
          className={inputCls}
          value={p.businessName}
          onChange={(e) => p.setBusinessName(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-[#E0E0E0] mb-1">
          {t('Business Type', 'Tipo de Negocio')}
        </label>
        <select className={inputCls} value={p.businessType} onChange={(e) => p.setBusinessType(e.target.value)}>
          {BUSINESS_TYPES.map((bt) => (
            <option key={bt.value} value={bt.value}>
              {p.language === 'es' ? bt.es : bt.en}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-[#E0E0E0] mb-1">
          {t('Description (English)', 'Descripción (Inglés)')}
        </label>
        <textarea
          className={inputCls}
          rows={3}
          value={p.description}
          onChange={(e) => p.setDescription(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-[#E0E0E0] mb-1">
          {t('Description (Spanish)', 'Descripción (Español)')}
        </label>
        <textarea
          className={inputCls}
          rows={3}
          value={p.descriptionEs}
          onChange={(e) => p.setDescriptionEs(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-[#E0E0E0] mb-2">
          {t('Specialties', 'Especialidades')}
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
                  : 'bg-stone-100 dark:bg-tribe-mid text-stone-700 dark:text-[#E0E0E0]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-stone-700 dark:text-[#E0E0E0] mb-1">
          {t('Address', 'Dirección')}
        </label>
        <input className={inputCls} value={p.address} onChange={(e) => p.setAddress(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-[#E0E0E0] mb-1">
            {t('Website', 'Sitio Web')}
          </label>
          <input
            className={inputCls}
            value={p.website}
            onChange={(e) => p.setWebsite(e.target.value)}
            placeholder="https://"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-stone-700 dark:text-[#E0E0E0] mb-1">
            {t('Phone', 'Teléfono')}
          </label>
          <input className={inputCls} value={p.phone} onChange={(e) => p.setPhone(e.target.value)} />
        </div>
      </div>

      <button
        type="submit"
        disabled={p.submitting || !p.businessName.trim()}
        className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-xl text-base hover:bg-lime-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {p.submitting && <Loader className="w-4 h-4 animate-spin" />}
        {t('Submit Application', 'Enviar Solicitud')}
      </button>
    </form>
  );
}
