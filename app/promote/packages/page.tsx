'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { insertServicePackage, fetchServicePackages, deactivateServicePackage } from '@/lib/dal/promote';
import { showSuccess, showError } from '@/lib/toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import BottomNav from '@/components/BottomNav';
import { ArrowLeft, Plus, Package, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import type { Database } from '@/lib/database.types';

type ServicePackageRow = Database['public']['Tables']['service_packages']['Row'];

const translations = {
  en: {
    title: 'Service Packages',
    subtitle: 'active packages',
    createButton: 'Create Package',
    formTitle: 'New Service Package',
    name: 'Package Name',
    namePlaceholder: '10-Session Training Pack',
    description: 'Description',
    descriptionPlaceholder: 'What does this package include?',
    priceCents: 'Price',
    pricePlaceholder: 'e.g. 150000 for COP $150,000',
    currency: 'Currency',
    packageType: 'Package Type',
    sessionPack: 'Session Pack',
    membership: 'Membership',
    custom: 'Custom',
    sessionCount: 'Number of Sessions (optional)',
    durationDays: 'Duration in Days (optional)',
    tag: 'Tag (optional)',
    tagPlaceholder: 'Popular, Best Value…',
    create: 'Create Package',
    cancel: 'Cancel',
    emptyState: 'No packages yet',
    emptyDescription: 'Create your first service package to display on your storefront.',
    errorAuth: 'You must be logged in as an instructor to manage packages.',
    errorFetch: 'Failed to load packages.',
    errorCreate: 'Failed to create package.',
    successCreate: 'Package created successfully.',
    nameRequired: 'Package name is required.',
    priceRequired: 'Price is required and must be greater than zero.',
    sessions: 'sessions',
    days: 'days',
    active: 'Active',
    deactivated: 'Deactivated',
    deactivate: 'Deactivate',
    reactivate: 'Reactivate',
  },
  es: {
    title: 'Paquetes de Servicio',
    subtitle: 'paquetes activos',
    createButton: 'Crear Paquete',
    formTitle: 'Nuevo Paquete de Servicio',
    name: 'Nombre del Paquete',
    namePlaceholder: 'Paquete de 10 Sesiones',
    description: 'Descripción',
    descriptionPlaceholder: '¿Qué incluye este paquete?',
    priceCents: 'Precio',
    pricePlaceholder: 'ej. 150000 para COP $150,000',
    currency: 'Moneda',
    packageType: 'Tipo de Paquete',
    sessionPack: 'Pack de Sesiones',
    membership: 'Membresía',
    custom: 'Personalizado',
    sessionCount: 'Número de Sesiones (opcional)',
    durationDays: 'Duración en Días (opcional)',
    tag: 'Etiqueta (opcional)',
    tagPlaceholder: 'Popular, Mejor Valor…',
    create: 'Crear Paquete',
    cancel: 'Cancelar',
    emptyState: 'Sin paquetes aún',
    emptyDescription: 'Crea tu primer paquete de servicio para mostrarlo en tu escaparate.',
    errorAuth: 'Debes estar conectado como instructor para gestionar paquetes.',
    errorFetch: 'No se pudieron cargar los paquetes.',
    errorCreate: 'No se pudo crear el paquete.',
    successCreate: 'Paquete creado exitosamente.',
    nameRequired: 'El nombre del paquete es obligatorio.',
    priceRequired: 'El precio es obligatorio y debe ser mayor que cero.',
    sessions: 'sesiones',
    days: 'días',
    active: 'Activo',
    deactivated: 'Desactivado',
    deactivate: 'Desactivar',
    reactivate: 'Reactivar',
  },
} as const;

interface FormState {
  name: string;
  description: string;
  priceCents: string;
  currency: 'COP' | 'USD';
  packageType: 'session_pack' | 'membership' | 'custom';
  sessionCount: string;
  durationDays: string;
  tag: string;
}

const defaultForm: FormState = {
  name: '',
  description: '',
  priceCents: '',
  currency: 'COP',
  packageType: 'session_pack',
  sessionCount: '',
  durationDays: '',
  tag: '',
};

export default function PackagesPage() {
  const { language } = useLanguage();
  const t = translations[language as keyof typeof translations] ?? translations.en;
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<ServicePackageRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const activeCount = packages.filter((p) => p.is_active).length;

  const loadPackages = useCallback(
    async (uid: string) => {
      const result = await fetchServicePackages(supabase, uid);
      if (result.success && result.data) {
        // Show all packages including inactive so instructor can reactivate
        setPackages(result.data);
      } else if (!result.success) {
        showError(t.errorFetch);
      }
    },
    [supabase, t.errorFetch]
  );

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAuthError(t.errorAuth);
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('is_instructor')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.is_instructor) {
        setAuthError(t.errorAuth);
        setLoading(false);
        return;
      }

      setUserId(user.id);
      await loadPackages(user.id);
      setLoading(false);
    })();
  }, [supabase, t.errorAuth, loadPackages]);

  const handleCreate = async () => {
    if (!userId) return;

    const name = form.name.trim();
    if (!name) {
      showError(t.nameRequired);
      return;
    }
    const priceCentsNum = parseInt(form.priceCents, 10);
    if (!form.priceCents || isNaN(priceCentsNum) || priceCentsNum <= 0) {
      showError(t.priceRequired);
      return;
    }

    setSubmitting(true);
    const result = await insertServicePackage(supabase, {
      instructor_id: userId,
      name,
      description: form.description.trim() || null,
      price_cents: priceCentsNum,
      currency: form.currency,
      package_type: form.packageType,
      session_count: form.sessionCount ? parseInt(form.sessionCount, 10) : null,
      duration_days: form.durationDays ? parseInt(form.durationDays, 10) : null,
      tag: form.tag.trim() || null,
      is_active: true,
    });
    setSubmitting(false);

    if (!result.success) {
      showError(t.errorCreate);
      return;
    }

    showSuccess(t.successCreate);
    setForm(defaultForm);
    setShowForm(false);
    await loadPackages(userId);
  };

  const handleToggleActive = async (pkg: ServicePackageRow) => {
    if (!userId) return;
    if (pkg.is_active) {
      const result = await deactivateServicePackage(supabase, pkg.id);
      if (!result.success) {
        showError(t.errorCreate);
        return;
      }
    } else {
      // Reactivate by calling updateServicePackage directly would require
      // importing it; instead we refresh after a direct update via the DAL
      // shape. Since updateServicePackage is exported from the same DAL file,
      // import it here.
      const { updateServicePackage } = await import('@/lib/dal/promote');
      const result = await updateServicePackage(supabase, pkg.id, { is_active: true });
      if (!result.success) {
        showError(t.errorCreate);
        return;
      }
    }
    await loadPackages(userId);
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <p className="text-lg text-theme-secondary">{authError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
          <Link
            href="/promote"
            className="flex items-center gap-2 text-tribe-green hover:text-tribe-green/80 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 ml-3">
            <h1 className="text-lg font-bold text-theme-primary">{t.title}</h1>
            <p className="text-xs text-theme-secondary">
              {activeCount} {t.subtitle}
            </p>
          </div>
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6 space-y-4">
        {/* Create Button */}
        <button
          onClick={() => setShowForm((v) => !v)}
          className="w-full bg-tribe-green text-slate-900 font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition hover:bg-tribe-green/90"
        >
          <Plus className="w-5 h-5" />
          {t.createButton}
        </button>

        {/* Create Form */}
        {showForm && (
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
                onClick={handleCreate}
                disabled={submitting}
                className="flex-1 bg-tribe-green text-slate-900 disabled:bg-tribe-green/50 font-semibold rounded-xl py-3 transition"
              >
                {submitting ? (language === 'es' ? 'Creando…' : 'Creating…') : t.create}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setForm(defaultForm);
                }}
                className="flex-1 bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300 rounded-xl py-3 font-semibold transition"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        )}

        {/* Package List */}
        {packages.length === 0 ? (
          <div className="bg-white dark:bg-tribe-card rounded-2xl p-12 border border-stone-200 dark:border-gray-700 text-center">
            <Package className="w-12 h-12 mx-auto mb-4 text-stone-400" />
            <h3 className="text-lg font-bold text-theme-primary mb-2">{t.emptyState}</h3>
            <p className="text-theme-secondary">{t.emptyDescription}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {packages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} t={t} language={language} onToggleActive={handleToggleActive} />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

type TranslationShape = (typeof translations)[keyof typeof translations];

interface PackageCardProps {
  pkg: ServicePackageRow;
  t: TranslationShape;
  language: string;
  onToggleActive: (pkg: ServicePackageRow) => Promise<void>;
}

function PackageCard({ pkg, t, language, onToggleActive }: PackageCardProps) {
  const price =
    pkg.currency === 'COP'
      ? `$${(pkg.price_cents / 100).toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP`
      : `$${(pkg.price_cents / 100).toFixed(2)} USD`;

  return (
    <div className="bg-white dark:bg-tribe-card rounded-2xl p-5 border border-stone-200 dark:border-gray-700">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-theme-primary truncate">{pkg.name}</h3>
            {pkg.tag && (
              <span className="text-xs bg-tribe-green/20 text-tribe-green px-2 py-0.5 rounded-full font-medium">
                {pkg.tag}
              </span>
            )}
          </div>
          {pkg.description && <p className="text-theme-secondary text-sm mt-1 line-clamp-2">{pkg.description}</p>}
        </div>
        <span
          className={`text-xs px-3 py-1 rounded-full font-semibold flex-shrink-0 ${
            pkg.is_active ? 'bg-tribe-green/20 text-tribe-green' : 'bg-stone-200 dark:bg-stone-700 text-stone-500'
          }`}
        >
          {pkg.is_active ? t.active : t.deactivated}
        </span>
      </div>

      <p className="text-xl font-bold text-tribe-green mb-3">{price}</p>

      <div className="flex gap-3 text-xs text-theme-secondary mb-3">
        {pkg.session_count !== null && (
          <span>
            {pkg.session_count} {t.sessions}
          </span>
        )}
        {pkg.duration_days !== null && (
          <span>
            {pkg.duration_days} {t.days}
          </span>
        )}
      </div>

      <div className="pt-3 border-t border-stone-200 dark:border-gray-700">
        <button
          onClick={() => onToggleActive(pkg)}
          className={`flex items-center gap-2 text-sm font-medium py-2 px-3 rounded-lg transition w-full justify-center ${
            pkg.is_active
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
              : 'bg-tribe-green/20 text-tribe-green hover:bg-tribe-green/30'
          }`}
        >
          {pkg.is_active ? (
            <>
              <ToggleLeft className="w-4 h-4" />
              {t.deactivate}
            </>
          ) : (
            <>
              <ToggleRight className="w-4 h-4" />
              {t.reactivate}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
