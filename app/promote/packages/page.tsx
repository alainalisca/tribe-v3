'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import BottomNav from '@/components/BottomNav';
import { ArrowLeft, Plus, Package, AlertCircle } from 'lucide-react';
import { usePackages } from './usePackages';
import { PackageCard } from './PackageCard';
import { PackageForm } from './PackageForm';
import { defaultForm } from './packagesI18n';

export default function PackagesPage() {
  const { language } = useLanguage();
  const {
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
  } = usePackages(language);

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
          onClick={() => setShowForm(!showForm)}
          className="w-full bg-tribe-green text-slate-900 font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition hover:bg-tribe-green/90"
        >
          <Plus className="w-5 h-5" />
          {t.createButton}
        </button>

        {/* Create Form */}
        {showForm && (
          <PackageForm
            t={t}
            language={language}
            form={form}
            submitting={submitting}
            updateField={updateField}
            onSubmit={handleCreate}
            onCancel={() => {
              setShowForm(false);
              setForm(defaultForm);
            }}
          />
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
