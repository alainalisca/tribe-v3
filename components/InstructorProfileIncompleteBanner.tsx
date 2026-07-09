'use client';

/**
 * T-PROF1: shown on the instructor dashboard while the instructor is hidden
 * from the "Train with an Instructor" discover page. Lists exactly which of
 * the five required fields are still missing and links to profile editing.
 * Renders nothing when the profile is complete.
 */

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { InstructorField } from '@/lib/instructorProfile';

interface InstructorProfileIncompleteBannerProps {
  missingFields: InstructorField[];
}

export default function InstructorProfileIncompleteBanner({ missingFields }: InstructorProfileIncompleteBannerProps) {
  const t = useTranslations('instructorIncomplete');

  if (missingFields.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-900/20 p-4 mb-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">{t('title')}</h3>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{t('description')}</p>
          <ul className="mt-2 list-disc pl-4 space-y-0.5 text-xs text-amber-800 dark:text-amber-300">
            {missingFields.map((field) => (
              <li key={field}>{t(`fields.${field}`)}</li>
            ))}
          </ul>
          <Link
            href="/profile/edit"
            className="mt-3 inline-block px-4 py-2 rounded-lg bg-amber-500 text-slate-900 text-xs font-bold hover:bg-amber-400 transition"
          >
            {t('cta')}
          </Link>
        </div>
      </div>
    </div>
  );
}
