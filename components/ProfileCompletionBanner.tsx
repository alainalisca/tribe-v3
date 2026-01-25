'use client';

import { X } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

interface ProfileCompletionBannerProps {
  hasPhoto: boolean;
  hasSports: boolean;
  hasName?: boolean;
  userId?: string;
}

export default function ProfileCompletionBanner({ hasPhoto, hasSports, hasName = true, userId }: ProfileCompletionBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { language } = useLanguage();

  // Check localStorage for persistent dismissal on mount
  useEffect(() => {
    if (userId) {
      const wasDismissed = localStorage.getItem(`profileBannerDismissed_${userId}`);
      if (wasDismissed) {
        setDismissed(true);
      }
    }
  }, [userId]);

  // Profile is complete if user has name, photo, and sports
  const isProfileComplete = hasName && hasPhoto && hasSports;

  // Don't show if dismissed OR if profile is complete
  if (dismissed || isProfileComplete) return null;

  const message = language === 'es' 
    ? '¡Completa tu perfil para ayudar a otros a encontrarte!'
    : 'Complete your profile to help others find you!';

  return (
    <div className="bg-tribe-green/10 border border-tribe-green/30 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-stone-900 dark:text-white font-medium">{message}</p>
          <div className="flex flex-wrap gap-4 mt-2 text-sm">
            {!hasName && (
              <Link href="/profile/edit" className="text-tribe-green hover:underline">
                {language === 'es' ? '+ Agregar nombre' : '+ Add name'}
              </Link>
            )}
            {!hasPhoto && (
              <Link href="/profile/edit" className="text-tribe-green hover:underline">
                {language === 'es' ? '+ Agregar foto' : '+ Add photo'}
              </Link>
            )}
            {!hasSports && (
              <Link href="/profile/edit" className="text-tribe-green hover:underline">
                {language === 'es' ? '+ Agregar deportes' : '+ Add sports'}
              </Link>
            )}
          </div>
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            if (userId) {
              localStorage.setItem(`profileBannerDismissed_${userId}`, 'true');
            }
          }}
          className="text-stone-500 hover:text-stone-700"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
