'use client';

import { Package, FileText, Ticket } from 'lucide-react';

type ProductType = 'physical' | 'digital' | 'package';

interface ProductTypeSelectorProps {
  value: ProductType | '';
  onChange: (type: ProductType) => void;
  language: 'en' | 'es';
}

const TYPES: { id: ProductType; icon: typeof Package; en: string; es: string; descEn: string; descEs: string }[] = [
  {
    id: 'physical',
    icon: Package,
    en: 'Merch & Gear',
    es: 'Mercanc\u00EDa',
    descEn: 'Physical products with pickup',
    descEs: 'Productos f\u00EDsicos con recogida',
  },
  {
    id: 'digital',
    icon: FileText,
    en: 'Training Plan',
    es: 'Plan de Entrenamiento',
    descEn: 'Digital files for instant download',
    descEs: 'Archivos digitales de descarga instant\u00E1nea',
  },
  {
    id: 'package',
    icon: Ticket,
    en: 'Session Pack',
    es: 'Paquete de Sesiones',
    descEn: 'Bundle of session credits',
    descEs: 'Paquete de cr\u00E9ditos de sesi\u00F3n',
  },
];

export default function ProductTypeSelector({ value, onChange, language }: ProductTypeSelectorProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-theme-primary">
        {language === 'es' ? 'Tipo de Producto *' : 'Product Type *'}
      </p>
      <div className="grid grid-cols-1 gap-3">
        {TYPES.map((type) => {
          const Icon = type.icon;
          const isSelected = value === type.id;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => onChange(type.id)}
              className={`p-4 rounded-xl text-left transition-all flex items-start gap-3 ${
                isSelected
                  ? 'bg-tribe-green/10 border-2 border-tribe-green'
                  : 'bg-theme-card border border-theme hover:border-tribe-green'
              }`}
            >
              <div className={`p-2 rounded-lg ${isSelected ? 'bg-tribe-green' : 'bg-stone-100 dark:bg-tribe-surface'}`}>
                <Icon className={`w-5 h-5 ${isSelected ? 'text-slate-900' : 'text-theme-primary'}`} />
              </div>
              <div>
                <p className="font-bold text-theme-primary text-sm">{language === 'es' ? type.es : type.en}</p>
                <p className="text-xs text-theme-secondary mt-0.5">{language === 'es' ? type.descEs : type.descEn}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
