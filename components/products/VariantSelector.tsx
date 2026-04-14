'use client';

interface Variant {
  id: string;
  name: string;
  name_es?: string;
  price_cents?: number;
  inventory_count?: number;
  is_active?: boolean;
}

interface VariantSelectorProps {
  variants: Variant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  language: 'en' | 'es';
}

export default function VariantSelector({ variants, selectedId, onSelect, language }: VariantSelectorProps) {
  const activeVariants = variants.filter((v) => v.is_active !== false);

  if (activeVariants.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-theme-primary">{language === 'es' ? 'Variante' : 'Variant'}</p>
      <div className="flex flex-wrap gap-2">
        {activeVariants.map((variant) => {
          const label = language === 'es' && variant.name_es ? variant.name_es : variant.name;
          const isOutOfStock = variant.inventory_count !== undefined && variant.inventory_count <= 0;
          const isSelected = selectedId === variant.id;

          return (
            <button
              key={variant.id}
              onClick={() => !isOutOfStock && onSelect(variant.id)}
              disabled={isOutOfStock}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                isSelected
                  ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green'
                  : isOutOfStock
                    ? 'bg-stone-100 dark:bg-tribe-surface text-stone-400 dark:text-gray-500 cursor-not-allowed'
                    : 'bg-stone-100 dark:bg-tribe-surface text-theme-primary hover:border-tribe-green border border-transparent'
              }`}
            >
              {label}
              {isOutOfStock && <span className="ml-1 text-xs">({language === 'es' ? 'Agotado' : 'Out'})</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
