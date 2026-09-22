'use client';

import { X, Camera, Dumbbell } from 'lucide-react';
import { useBannerDismissal, BANNER_IDS } from '@/hooks/useBannerDismissal';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

interface ProfileCompletionBannerProps {
  hasPhoto: boolean;
  hasSports: boolean;
  hasName?: boolean;
}

// How long the banner stays hidden after the user dismisses it. We snooze
// instead of dismissing forever so users who skipped adding a photo get a
// gentle reminder again later, while users who completed their profile never

export default function ProfileCompletionBanner({ hasPhoto, hasSports, hasName = true }: ProfileCompletionBannerProps) {
  const { t, language } = useLanguage();
  // T-ONB1: was a timed snooze in localStorage, so it came back on a timer and
  // was per-device besides. Dismissal is now permanent and server-side. The
  // banner is still conditional — it hides itself the moment the profile is
  // complete — so it can return if the athlete later empties their profile,
  // which is the condition changing rather than a new session starting.
  const { dismissed, loading, dismiss } = useBannerDismissal(BANNER_IDS.profileCompletion);

  const isProfileComplete = hasName && hasPhoto && hasSports;

  // Unknown means render nothing.
  if (loading || dismissed || isProfileComplete) return null;

  const handleDismiss = () => dismiss();

  // SPORTS LEADS, THEN PHOTO, THEN THE GENERIC ASK.
  //
  // Sports was previously a secondary text link behind the photo ask, and it
  // pointed at /profile/edit -- a form of fifteen optional fields where sports
  // is one row among many. Measured on 2026-09-21: of 60 non-test athletes, 28
  // have neither sports nor photo and 6 have a photo but no sports -- so 34
  // have no sports, which is the population this banner's sports ask is for,
  // and the number confirmed on the live database when 188 applied. So sports
  // is the more common gap AND the one this app cannot work without: it is
  // what find_training_partners ranks on and what /instructors filters by. An
  // athlete with no sports is invisible to both, whatever their photo says.
  //
  // The sports ask therefore leads and goes to /onboarding/sports -- the same
  // one screen new athletes now see, where the only decision is which sports,
  // and where the write refuses an empty list.
  const sportsLeadMessage =
    language === 'es'
      ? 'Elige tus deportes para que otros atletas puedan encontrarte.'
      : 'Choose your sports so other athletes can find you.';
  const chooseSportsCta = language === 'es' ? 'Elegir deportes' : 'Choose sports';
  const photoLeadMessage =
    language === 'es'
      ? 'Agrega una foto de perfil para que otros atletas te reconozcan.'
      : 'Add a profile photo so other athletes recognize you.';
  const genericMessage =
    language === 'es'
      ? '¡Completa tu perfil para ayudar a otros a encontrarte!'
      : 'Complete your profile to help others find you!';

  return (
    <div className="bg-tribe-green/10 border border-tribe-green/30 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between gap-3">
        {!hasSports ? (
          <div className="flex items-center gap-3 flex-1">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-tribe-green/20 border border-tribe-green/40 flex items-center justify-center">
              <Dumbbell className="w-6 h-6 text-tribe-green" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="text-stone-900 dark:text-white font-medium">{sportsLeadMessage}</p>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                <Link
                  href="/onboarding/sports"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tribe-green text-slate-900 font-semibold hover:bg-tribe-green/90 transition"
                >
                  <Dumbbell className="w-4 h-4" aria-hidden="true" />
                  {chooseSportsCta}
                </Link>
                {!hasName && (
                  <Link href="/profile/edit" className="text-tribe-green hover:underline">
                    {t('addName')}
                  </Link>
                )}
                {!hasPhoto && (
                  <Link href="/profile/edit" className="text-tribe-green hover:underline">
                    {t('addPhoto')}
                  </Link>
                )}
              </div>
            </div>
          </div>
        ) : !hasPhoto ? (
          <div className="flex items-center gap-3 flex-1">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-tribe-green/20 border border-tribe-green/40 flex items-center justify-center">
              <Camera className="w-6 h-6 text-tribe-green" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="text-stone-900 dark:text-white font-medium">{photoLeadMessage}</p>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                <Link
                  href="/profile/edit"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-tribe-green text-slate-900 font-semibold hover:bg-tribe-green/90 transition"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  {t('addPhoto')}
                </Link>
                {!hasName && (
                  <Link href="/profile/edit" className="text-tribe-green hover:underline">
                    {t('addName')}
                  </Link>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1">
            <p className="text-stone-900 dark:text-white font-medium">{genericMessage}</p>
            <div className="flex flex-wrap gap-4 mt-2 text-sm">
              {!hasName && (
                <Link href="/profile/edit" className="text-tribe-green hover:underline">
                  {t('addName')}
                </Link>
              )}
            </div>
          </div>
        )}
        <button
          onClick={handleDismiss}
          className="text-stone-500 hover:text-stone-700 flex-shrink-0"
          aria-label={language === 'es' ? 'Descartar' : 'Dismiss'}
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
