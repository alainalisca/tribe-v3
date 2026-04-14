'use client';

import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface VariantInput {
  name: string;
  name_es: string;
  price_cents: string;
  inventory_count: string;
}

interface VariantBuilderProps {
  variants: VariantInput[];
  onChange: (variants: VariantInput[]) => void;
  currency: string;
  language: 'en' | 'es';
}

export default function VariantBuilder({ variants, onChange, currency, language }: VariantBuilderProps) {
  function addVariant() {
    onChange([...variants, { name: '', name_es: '', price_cents: '', inventory_count: '' }]);
  }

  function removeVariant(index: number) {
    onChange(variants.filter((_, i) => i !== index));
  }

  function updateVariant(index: number, field: keyof VariantInput, value: string) {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-theme-primary">{language === 'es' ? 'Variantes' : 'Variants'}</p>

      {variants.map((variant, idx) => (
        <div key={idx} className="bg-stone-50 dark:bg-tribe-surface rounded-xl p-3 space-y-2 relative">
          <button
            type="button"
            onClick={() => removeVariant(idx)}
            className="absolute top-2 right-2 w-6 h-6 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center"
          >
            <X className="w-3 h-3 text-red-600" />
          </button>

          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder={language === 'es' ? 'Nombre (EN)' : 'Name (EN)'}
              value={variant.name}
              onChange={(e) => updateVariant(idx, 'name', e.target.value)}
              className="h-9 text-sm bg-theme-card border-theme text-theme-primary"
            />
            <Input
              placeholder={language === 'es' ? 'Nombre (ES)' : 'Name (ES)'}
              value={variant.name_es}
              onChange={(e) => updateVariant(idx, 'name_es', e.target.value)}
              className="h-9 text-sm bg-theme-card border-theme text-theme-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder={`${language === 'es' ? 'Precio' : 'Price'} (${currency})`}
              value={variant.price_cents}
              onChange={(e) => updateVariant(idx, 'price_cents', e.target.value)}
              className="h-9 text-sm bg-theme-card border-theme text-theme-primary"
            />
            <Input
              type="number"
              placeholder={language === 'es' ? 'Inventario' : 'Inventory'}
              value={variant.inventory_count}
              onChange={(e) => updateVariant(idx, 'inventory_count', e.target.value)}
              className="h-9 text-sm bg-theme-card border-theme text-theme-primary"
            />
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={addVariant}
        className="w-full border-dashed border-theme text-theme-secondary text-sm"
      >
        <Plus className="w-4 h-4 mr-1" />
        {language === 'es' ? 'Agregar Variante' : 'Add Variant'}
      </Button>
    </div>
  );
}
