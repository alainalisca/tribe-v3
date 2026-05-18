'use client';

import { Store } from 'lucide-react';

/**
 * Shown when an instructor has no sessions, packages, products, media,
 * posts, or reviews yet — so a fresh storefront reads as intentional
 * instead of a broken empty void. Theme tokens only.
 */
export default function StorefrontEmpty({ language }: { language: 'en' | 'es' }) {
  return (
    <div className="rounded-2xl border border-theme bg-theme-card p-8 text-center">
      <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-tribe-green/15 flex items-center justify-center">
        <Store className="w-6 h-6 text-tribe-green" />
      </div>
      <p className="text-sm font-semibold text-theme-primary mb-1">
        {language === 'es' ? 'Tienda en construcción' : 'Storefront not set up yet'}
      </p>
      <p className="text-sm text-theme-secondary">
        {language === 'es'
          ? 'Este instructor aún no ha añadido sesiones, paquetes ni contenido. Vuelve pronto.'
          : "This instructor hasn't added any sessions, packages, or content yet. Check back soon."}
      </p>
    </div>
  );
}
