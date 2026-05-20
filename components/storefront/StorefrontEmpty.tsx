'use client';

import { Store } from 'lucide-react';

/**
 * Shown when an instructor has no sessions, packages, products, media,
 * posts, or reviews yet. BUG-019: the "not set up yet" copy is only
 * useful to the instructor themselves. Non-owner visitors get a softer
 * "new on Tribe" framing — they don't need to know the storefront is
 * unconfigured.
 */
export default function StorefrontEmpty({ language, isOwner = false }: { language: 'en' | 'es'; isOwner?: boolean }) {
  const ownerTitle = language === 'es' ? 'Tienda en construcción' : 'Storefront not set up yet';
  const ownerBody =
    language === 'es'
      ? 'Aún no has añadido sesiones, paquetes ni contenido. Empieza creando una sesión.'
      : "You haven't added any sessions, packages, or content yet. Start by creating a session.";
  const visitorTitle = language === 'es' ? 'Nuevo en Tribe' : 'New on Tribe';
  const visitorBody =
    language === 'es'
      ? 'Este instructor acaba de unirse. Vuelve pronto para ver sus sesiones.'
      : 'This instructor just joined. Check back soon for their sessions.';

  return (
    <div className="rounded-2xl border border-theme bg-theme-card p-8 text-center">
      <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-tribe-green/15 flex items-center justify-center">
        <Store className="w-6 h-6 text-tribe-green" />
      </div>
      <p className="text-sm font-semibold text-theme-primary mb-1">{isOwner ? ownerTitle : visitorTitle}</p>
      <p className="text-sm text-theme-secondary">{isOwner ? ownerBody : visitorBody}</p>
    </div>
  );
}
