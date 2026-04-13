'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Save, Loader, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import {
  upsertServicePackage,
  deactivateDashboardPackage,
  type ServicePackageRow,
  type ServicePackageUpsert,
} from '@/lib/dal/instructorDashboard';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';
import { showSuccess, showError } from '@/lib/toast';

interface PackageManagerProps {
  language: 'en' | 'es';
  userId: string;
  initialPackages: ServicePackageRow[];
}

const EMPTY_FORM: ServicePackageUpsert = {
  name: '',
  description: null,
  price_cents: 0,
  currency: 'COP',
  package_type: 'single',
  session_count: null,
  is_active: true,
};

export default function PackageManager({ language, userId, initialPackages }: PackageManagerProps) {
  const supabase = createClient();
  const [packages, setPackages] = useState<ServicePackageRow[]>(initialPackages);
  const [editing, setEditing] = useState<ServicePackageUpsert | null>(null);
  const [saving, setSaving] = useState(false);

  const txt = {
    title: language === 'es' ? 'Paquetes y Servicios' : 'Packages & Services',
    addNew: language === 'es' ? 'Agregar Paquete' : 'Add Package',
    name: language === 'es' ? 'Nombre' : 'Name',
    description: language === 'es' ? 'Descripcion' : 'Description',
    price: language === 'es' ? 'Precio (centavos)' : 'Price (cents)',
    currency: language === 'es' ? 'Moneda' : 'Currency',
    type: language === 'es' ? 'Tipo' : 'Type',
    sessionCount: language === 'es' ? 'Cantidad de Sesiones' : 'Session Count',
    save: language === 'es' ? 'Guardar' : 'Save',
    cancel: language === 'es' ? 'Cancelar' : 'Cancel',
    delete: language === 'es' ? 'Eliminar' : 'Delete',
    saved: language === 'es' ? 'Paquete guardado' : 'Package saved',
    deleted: language === 'es' ? 'Paquete eliminado' : 'Package removed',
    noPackages: language === 'es' ? 'Aun no tienes paquetes de servicio' : 'No service packages yet',
    single: language === 'es' ? 'Individual' : 'Single',
    multi: language === 'es' ? 'Multi-sesion' : 'Multi-session',
    subscription: language === 'es' ? 'Suscripcion' : 'Subscription',
  };

  const packageTypeOptions = [
    { value: 'single', label: txt.single },
    { value: 'multi', label: txt.multi },
    { value: 'subscription', label: txt.subscription },
  ];

  async function handleSave() {
    if (!editing || !editing.name.trim()) return;
    setSaving(true);

    const result = await upsertServicePackage(supabase, userId, editing);

    if (result.success && result.data) {
      const updated = editing.id
        ? packages.map((p) => (p.id === editing.id ? result.data! : p))
        : [...packages, result.data];
      setPackages(updated);
      setEditing(null);
      showSuccess(txt.saved);
    } else {
      showError(result.error || 'Error');
    }
    setSaving(false);
  }

  async function handleDelete(pkgId: string) {
    const result = await deactivateDashboardPackage(supabase, pkgId);
    if (result.success) {
      setPackages(packages.filter((p) => p.id !== pkgId));
      showSuccess(txt.deleted);
    } else {
      showError(result.error || 'Error');
    }
  }

  return (
    <div className="space-y-4">
      {/* Add button */}
      {!editing && (
        <Button onClick={() => setEditing({ ...EMPTY_FORM })} className="w-full py-3 font-semibold">
          <Plus className="w-4 h-4 mr-2" />
          {txt.addNew}
        </Button>
      )}

      {/* Edit/Create Form */}
      {editing && (
        <div className="p-4 bg-white dark:bg-tribe-surface rounded-xl border-2 border-tribe-green space-y-3">
          <input
            type="text"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder={txt.name}
            className="w-full px-3 py-2 rounded-lg bg-stone-50 dark:bg-tribe-dark border border-stone-200 dark:border-[#52575D] text-theme-primary text-sm outline-none focus:ring-2 focus:ring-tribe-green"
          />
          <textarea
            value={editing.description || ''}
            onChange={(e) => setEditing({ ...editing, description: e.target.value || null })}
            placeholder={txt.description}
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-stone-50 dark:bg-tribe-dark border border-stone-200 dark:border-[#52575D] text-theme-primary text-sm outline-none focus:ring-2 focus:ring-tribe-green resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-theme-secondary mb-1">{txt.price}</label>
              <input
                type="number"
                value={editing.price_cents}
                onChange={(e) => setEditing({ ...editing, price_cents: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-lg bg-stone-50 dark:bg-tribe-dark border border-stone-200 dark:border-[#52575D] text-theme-primary text-sm outline-none focus:ring-2 focus:ring-tribe-green"
              />
            </div>
            <div>
              <label className="block text-xs text-theme-secondary mb-1">{txt.currency}</label>
              <select
                value={editing.currency}
                onChange={(e) => setEditing({ ...editing, currency: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-stone-50 dark:bg-tribe-dark border border-stone-200 dark:border-[#52575D] text-theme-primary text-sm outline-none focus:ring-2 focus:ring-tribe-green"
              >
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-theme-secondary mb-1">{txt.type}</label>
              <select
                value={editing.package_type}
                onChange={(e) => setEditing({ ...editing, package_type: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-stone-50 dark:bg-tribe-dark border border-stone-200 dark:border-[#52575D] text-theme-primary text-sm outline-none focus:ring-2 focus:ring-tribe-green"
              >
                {packageTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-theme-secondary mb-1">{txt.sessionCount}</label>
              <input
                type="number"
                value={editing.session_count || ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    session_count: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
                className="w-full px-3 py-2 rounded-lg bg-stone-50 dark:bg-tribe-dark border border-stone-200 dark:border-[#52575D] text-theme-primary text-sm outline-none focus:ring-2 focus:ring-tribe-green"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1 text-sm">
              {saving ? <Loader className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              {txt.save}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)} className="text-sm">
              <X className="w-4 h-4 mr-1" />
              {txt.cancel}
            </Button>
          </div>
        </div>
      )}

      {/* Package List */}
      {packages.length === 0 && !editing ? (
        <div className="p-6 text-center bg-white dark:bg-tribe-surface rounded-xl border border-stone-200 dark:border-[#52575D]">
          <Package className="w-8 h-8 text-theme-secondary mx-auto mb-2" />
          <p className="text-sm text-theme-secondary">{txt.noPackages}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="p-4 bg-white dark:bg-tribe-surface rounded-xl border border-stone-200 dark:border-[#52575D] flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-theme-primary">{pkg.name}</h4>
                {pkg.description && <p className="text-xs text-theme-secondary mt-0.5 truncate">{pkg.description}</p>}
                <p className="text-sm font-bold text-tribe-green mt-1">
                  {formatPrice(pkg.price_cents, pkg.currency as Currency)}
                  {pkg.session_count && (
                    <span className="text-xs font-normal text-theme-secondary ml-1">
                      / {pkg.session_count} {txt.sessionCount.toLowerCase()}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() =>
                    setEditing({
                      id: pkg.id,
                      name: pkg.name,
                      description: pkg.description,
                      price_cents: pkg.price_cents,
                      currency: pkg.currency,
                      package_type: pkg.package_type,
                      session_count: pkg.session_count,
                      is_active: pkg.is_active,
                    })
                  }
                  className="p-2 text-theme-secondary hover:text-tribe-green transition"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(pkg.id)}
                  className="p-2 text-theme-secondary hover:text-red-500 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
