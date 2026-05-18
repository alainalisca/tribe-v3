'use client';

/**
 * Branded 404. Previously the app shipped Next.js's unstyled default
 * for any dead/mistyped/shared-stale link — and link-sharing is a core
 * flow here. This keeps users in the app: themed, bilingual, with the
 * bottom nav so they're never stranded.
 */

import Link from 'next/link';
import { Compass } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';

export default function NotFound() {
  const { language } = useLanguage();
  const es = language === 'es';

  return (
    <div className="min-h-screen bg-theme-page pb-32 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-tribe-green/15 flex items-center justify-center">
            <Compass className="w-7 h-7 text-tribe-green" />
          </div>
          <p className="text-5xl font-black text-theme-primary mb-2">404</p>
          <p className="text-lg font-semibold text-theme-primary mb-1">
            {es ? 'Página no encontrada' : 'Page not found'}
          </p>
          <p className="text-sm text-theme-secondary mb-6">
            {es ? 'El enlace no existe o ya no está disponible.' : "This link doesn't exist or is no longer available."}
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-tribe-green text-slate-900 font-bold text-sm hover:opacity-90 transition"
          >
            {es ? 'Volver al inicio' : 'Back to home'}
          </Link>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
