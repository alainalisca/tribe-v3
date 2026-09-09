'use client';

import { useEffect, useState } from 'react';
import { useBannerDismissal, BANNER_IDS } from '@/hooks/useBannerDismissal';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { checkInstructorUpsellEligibility } from '@/lib/dal/instructors';
import { logError } from '@/lib/logger';

interface InstructorUpsellBannerProps {
  userId: string;
  language: string;
}

// PAY-01 layer 2: the banner invites people to teach, it does not sell
// charging through Tribe. Plain en/es object, no language ternaries.
const copy = {
  en: {
    headline: 'Your sessions are popular!',
    body: 'Teach on Tribe. Publish your sessions and get your own page. Free.',
    cta: 'Become an instructor',
  },
  es: {
    headline: '\u00a1Tus sesiones son populares!',
    body: 'Ense\u00f1a en Tribe. Publica tus sesiones y ten tu propia p\u00e1gina. Gratis.',
    cta: 'Quiero ser instructor',
  },
} as const;

export default function InstructorUpsellBanner({ userId, language }: InstructorUpsellBannerProps) {
  const [eligible, setEligible] = useState(false);
  // T-ONB1: was a 30-day localStorage snooze, so it returned on a timer and
  // was per-device. Dismissal is permanent and server-side now.
  const { dismissed, loading, dismiss } = useBannerDismissal(BANNER_IDS.instructorUpsell);

  useEffect(() => {
    if (loading || dismissed) return;

    // Check eligibility via DAL
    const supabase = createClient();
    checkInstructorUpsellEligibility(supabase, userId).then((result) => {
      if (!result.success) {
        logError(result.error, { action: 'InstructorUpsellBanner', userId });
        return;
      }
      if (result.data?.eligible) {
        setEligible(true);
      }
    });
  }, [userId, loading, dismissed]);

  // Unknown means render nothing.
  if (loading || dismissed || !eligible) return null;

  // The language prop is a plain string; anything that is not a known key falls back to English.
  const t = copy[language as keyof typeof copy] ?? copy.en;

  const handleDismiss = () => dismiss();

  return (
    <div className="relative bg-gradient-to-r from-tribe-green-light/10 to-emerald-50 dark:from-tribe-green-light/5 dark:to-emerald-900/20 border-l-4 border-tribe-green rounded-xl p-4">
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
        href="/onboarding/instructor"
        className="inline-block bg-tribe-green-light text-tribe-dark font-semibold rounded-lg px-4 py-2 text-sm hover:opacity-90 transition"
      >
        {t.cta}
      </Link>
    </div>
  );
}
