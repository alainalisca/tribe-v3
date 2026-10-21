'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';

/**
 * The line under the photo picker while a session has no photo. It says what
 * a photo does for the athlete; it makes no claim about bookings (Al,
 * 2026-10-21).
 */
export default function PhotoHint() {
  const t = useTranslations('sessionForm');
  return (
    <p className="text-xs text-tribe-amber mt-2 flex items-center gap-1.5">
      <span>💡</span>
      <span>{t('photoHint')}</span>
    </p>
  );
}
