'use client';

/**
 * Error boundary for /profile/[userId].
 *
 * The server page's try/catch already swallows fetch errors and renders
 * an empty-state profile (initialProfile: null → client shows "User not
 * found"). This boundary catches things the try/catch can't — client
 * render crashes, thrown errors in the attendance stat derivation,
 * invalid data shapes.
 */

import { useEffect } from 'react';
import { logError } from '@/lib/logger';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import { useLanguage } from '@/lib/LanguageContext';

export default function ProfileError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // This boundary sits INSIDE the root layout, so LanguageProvider is mounted
  // and a normal translation is available. app/global-error.tsx cannot do this
  // -- it renders when the layout tree itself is broken, so the provider may be
  // the thing that died, which is why that file prints both languages at once.
  const { language } = useLanguage();
  const es = language === 'es';

  useEffect(() => {
    logError(error, { action: 'ProfileError', digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-screen bg-theme-page pb-nav">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
          <button onClick={() => history.back()} className="mr-3" aria-label={es ? 'Volver' : 'Go back'}>
            <ArrowLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-xl font-bold text-theme-primary">{es ? 'Perfil' : 'Profile'}</h1>
        </div>
      </div>

      <div className="pt-header flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-theme-primary mb-2">
          {es ? 'Algo salió mal' : 'Something went wrong'}
        </h2>
        <p className="text-sm text-theme-secondary mb-6 max-w-sm">
          {es ? 'No pudimos cargar este perfil ahora mismo.' : "We couldn't load this profile right now."}
        </p>
        <Button onClick={reset} className="px-6 py-2 bg-tribe-green text-slate-900 font-semibold hover:bg-tribe-green">
          {es ? 'Intentar de nuevo' : 'Try again'}
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}
