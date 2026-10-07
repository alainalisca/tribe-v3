'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';
import type { AthleteMemberView } from '@/lib/atletas/athleteHomeView';

/** The level's name: badge in the hero, rungs in "Tu camino". Sponsored is "Próximamente". */
export default function LevelLabel({ level }: { level: AthleteMemberView['level'] }) {
  const t = useTranslations('athleteHome');
  if (level === 'captain') return <>{t('levelCaptain')}</>;
  if (level === 'athlete') return <>{t('levelAthlete')}</>;
  return <>{t('levelSponsored')}</>;
}
