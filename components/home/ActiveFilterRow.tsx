'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';

export interface ActiveFilter {
  /** Stable key, used for the chip's React key and its clear label. */
  id: string;
  /** Already-translated text shown on the chip. */
  label: string;
  clear: () => void;
}

interface ActiveFilterRowProps {
  filters: ActiveFilter[];
  onExpand: () => void;
}

/**
 * The compact row shown while the filter controls are collapsed.
 *
 * A Filters button carrying the active count, then one removable chip per
 * active filter. The session count deliberately is not here: at 375px it does
 * not fit beside two chips, and it stays in the expanded region where there
 * is room for it.
 */
export default function ActiveFilterRow({ filters, onExpand }: ActiveFilterRowProps) {
  const t = useTranslations('home');

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
      <button
        onClick={onExpand}
        aria-label={t('showFilters')}
        className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-theme bg-theme-card text-theme-secondary text-xs font-semibold whitespace-nowrap flex-shrink-0"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        {t('filters')}
        {filters.length > 0 && (
          <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-tribe-green text-slate-900 text-[11px] font-bold flex items-center justify-center">
            {filters.length}
          </span>
        )}
      </button>

      {filters.map((filter) => (
        <span
          key={filter.id}
          className="flex items-center gap-1 h-8 pl-3 pr-1.5 rounded-full bg-tribe-green text-slate-900 text-xs font-semibold whitespace-nowrap flex-shrink-0"
        >
          {filter.label}
          <button
            onClick={filter.clear}
            aria-label={t('clearFilter', { name: filter.label })}
            className="min-w-[24px] min-h-[24px] flex items-center justify-center rounded-full"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
