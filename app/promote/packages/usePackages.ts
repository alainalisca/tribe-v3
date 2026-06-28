'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { insertServicePackage, fetchServicePackages, deactivateServicePackage } from '@/lib/dal/promote';
import { showSuccess, showError } from '@/lib/toast';
import type { Database } from '@/lib/database.types';
import { translations, defaultForm, type FormState, type TranslationShape } from './packagesI18n';

type ServicePackageRow = Database['public']['Tables']['service_packages']['Row'];

export interface UsePackagesReturn {
  loading: boolean;
  packages: ServicePackageRow[];
  showForm: boolean;
  form: FormState;
  submitting: boolean;
  authError: string | null;
  activeCount: number;
  t: TranslationShape;
  setShowForm: (v: boolean) => void;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  updateField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  handleCreate: () => Promise<void>;
  handleToggleActive: (pkg: ServicePackageRow) => Promise<void>;
}

export function usePackages(language: string): UsePackagesReturn {
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

  return {
    loading,
    packages,
    showForm,
    form,
    submitting,
    authError,
    activeCount,
    t,
    setShowForm,
    setForm,
    updateField,
    handleCreate,
    handleToggleActive,
  };
}
