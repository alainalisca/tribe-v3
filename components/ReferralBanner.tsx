/** Component: ReferralBanner — Dismissible banner for home feed and profile showing referral CTA */
'use client';

import { X, Gift } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

interface ReferralBannerProps {
  userId: string;
}

export default function ReferralBanner({ userId }: ReferralBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const { language } = useLanguage();

  const txt = {
    en: {
      message: 'Invite friends, earn rewards',
      shareCode: 'Share your code',
    },
    es: {
      message: 'Invita amigos, gana recompensas',
      shareCode: 'Comparte tu código',
    },
  };

  const t = txt[language as keyof typeof txt] || txt.en;

  // Check localStorage for persistent dismissal on mount
  useEffect(() => {
    const wasDismissed = localStorage.getItem(`referralBannerDismissed_${userId}`);
    if (wasDismissed) {
      setDismissed(true);
    }
  }, [userId]);

  if (dismissed) return null;

  return (
    <div className="bg-tribe-green/15 border border-tribe-green/40 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <Gift className="w-5 h-5 text-tribe-green flex-shrink-0" />
          <p className="text-stone-900 dark:text-white font-medium">{t.message}</p>
        </div>
        <button
          onClick={() => {
            setDismissed(true);
            localStorage.setItem(`referralBannerDismissed_${userId}`, 'true');
          }}
          aria-label="Dismiss referral banner"
          className="text-stone-500 hover:text-stone-700 dark:text-gray-400 dark:hover:text-gray-300 flex-shrink-0 ml-2"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <Link href="/referral">
        <button className="mt-3 w-full py-2 bg-tribe-green text-slate-900 rounded-lg font-semibold hover:bg-tribe-green-hover transition">
          {t.shareCode}
        </button>
      </Link>
    </div>
  );
}
