'use client';

import { EPISODES } from '@/lib/site/episodes';
import { useSiteLanguage } from '@/lib/site/useSiteT';

/** The newest Tribe.TV episode's title in the visitor's language. */
export default function LatestEpisodeTitle() {
  const lang = useSiteLanguage();
  return <>{EPISODES[0]?.title[lang] ?? ''}</>;
}
