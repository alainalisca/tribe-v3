'use client';

import { ToggleLeft, ToggleRight } from 'lucide-react';
import type { Database } from '@/lib/database.types';
import type { TranslationShape } from './packagesI18n';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';

type ServicePackageRow = Database['public']['Tables']['service_packages']['Row'];

export interface PackageCardProps {
  pkg: ServicePackageRow;
  t: TranslationShape;
  language: string;
  onToggleActive: (pkg: ServicePackageRow) => Promise<void>;
}

export function PackageCard({ pkg, t, language, onToggleActive }: PackageCardProps): React.JSX.Element {
  const currency = (pkg.currency || 'COP') as Currency;
  const price = pkg.price_cents != null ? formatPrice(pkg.price_cents, currency) : '';

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
