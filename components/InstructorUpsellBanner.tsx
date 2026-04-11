'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { checkInstructorUpsellEligibility } from '@/lib/dal/instructors';
import { logError } from '@/lib/logger';

interface InstructorUpsellBannerProps {
  userId: string;
  language: string;
}

const DISMISS_KEY_PREFIX = 'tribe_upsell_dismissed_';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const text = {
  en: {
    headline: 'Your sessions are popular!',
    body: 'Upgrade to Instructor to charge for sessions and get a storefront.',
    cta: 'Upgrade Now',
  },
  es: {
    headline: '\u00a1Tus sesiones son populares!',
    body: 'Convi\u00e9rtete en Instructor para cobrar por sesiones y tener tu vitrina.',
    cta: 'Actualizar Ahora',
  },
} as const;

export default function InstructorUpsellBanner({ userId, language }: InstructorUpsellBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check localStorage dismissal
    const dismissKey = `${DISMISS_KEY_PREFIX}${userId}`;
    const dismissedAt = localStorage.getItem(dismissKey);
    if (dismissedAt) {
      const elapsed = Date.now() - Number(dismissedAt);
      if (elapsed < THIRTY_DAYS_MS) return;
    }

    // Check eligibility via DAL
    const supabase = createClient();
    checkInstructorUpsellEligibility(supabase, userId).then((result) => {
      if (!result.success) {
        logError(result.error, { action: 'InstructorUpsellBanner', userId });
        return;
      }
      if (result.data?.eligible) {
        setVisible(true);
      }
    });
  }, [userId]);

  if (!visible) return null;

  const t = language === 'es' ? text.es : text.en;

  const handleDismiss = () => {
    localStorage.setItem(`${DISMISS_KEY_PREFIX}${userId}`, String(Date.now()));
    setVisible(false);
  };

  return (
    <div className="relative bg-gradient-to-r from-[#A3E635]/10 to-emerald-50 dark:from-[#A3E635]/5 dark:to-emerald-900/20 border-l-4 border-[#A3E635] rounded-xl p-4">
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 transition p-1"
      >
        &#x2715;
      </button>

      <p className="text-base font-semibold text-stone-900 dark:text-white mb-1">&#x2728; {t.headline}</p>
      <p className="text-sm text-stone-600 dark:text-stone-300 mb-3 pr-6">{t.body}</p>

      <Link
        href="/profile/edit?wizard=1"
        className="inline-block bg-[#A3E635] text-[#272D34] font-semibold rounded-lg px-4 py-2 text-sm hover:opacity-90 transition"
      >
        {t.cta}
      </Link>
    </div>
  );
}
