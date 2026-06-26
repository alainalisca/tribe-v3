'use client';

import { X, Camera } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

interface ProfileCompletionBannerProps {
  hasPhoto: boolean;
  hasSports: boolean;
  hasName?: boolean;
  userId?: string;
}

// How long the banner stays hidden after the user dismisses it. We snooze
// instead of dismissing forever so users who skipped adding a photo get a
// gentle reminder again later, while users who completed their profile never
// see it. Photo-less profiles make the app feel empty, so we keep asking.
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default function ProfileCompletionBanner({
  hasPhoto,
  hasSports,
  hasName = true,
  userId,
}: ProfileCompletionBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { t, language } = useLanguage();

  // On mount, check whether the banner is still within its snooze window.
  // Migration: older builds wrote a permanent `profileBannerDismissed_*` flag.
  // We no longer read it (so those users re-enter the snooze cycle) and clean
  // it up here.
  useEffect(() => {
    if (!userId) return;
    localStorage.removeItem(`profileBannerDismissed_${userId}`);
    const snoozedUntilRaw = localStorage.getItem(`profileBannerSnoozedUntil_${userId}`);
    if (snoozedUntilRaw) {
      const snoozedUntil = Number.parseInt(snoozedUntilRaw, 10);
      if (Number.isFinite(snoozedUntil) && Date.now() < snoozedUntil) {
        setDismissed(true);
      }
    }
  }, [userId]);

  // Profile is complete if user has name, photo, and sports
  const isProfileComplete = hasName && hasPhoto && hasSports;

  // Don't show if snoozed OR if profile is complete
  if (dismissed || isProfileComplete) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (userId) {
      localStorage.setItem(`profileBannerSnoozedUntil_${userId}`, String(Date.now() + SNOOZE_MS));
    }
  };

  // When the photo is missing we lead with a photo-specific ask, because a real
  // face is what makes the app feel like real people. Name and sports stay as
  // secondary links. When the photo already exists we fall back to the generic
  // completion message.
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
        {!hasPhoto ? (
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
                {!hasSports && (
                  <Link href="/profile/edit" className="text-tribe-green hover:underline">
                    {t('addSports')}
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
              {!hasSports && (
                <Link href="/profile/edit" className="text-tribe-green hover:underline">
                  {t('addSports')}
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
