import type { Metadata } from 'next';
import CoachesContent from '@/components/site/pages/CoachesContent';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { siteCardPath } from '@/lib/site/paths';
import { fetchRoster } from '@/lib/site/roster';

/**
 * Page: /coaches/ (T-SITE1 Part E). Middleware serves it in the visitor's
 * language; /for-instructors/ 301s here. The plan section renders only while
 * COACH_PLANS_ENABLED is on.
 */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = siteLanguage((await params).lang);
  return siteMetadata('coaches', '/coaches/', siteCardPath('coaches', lang), lang);
}

export default async function CoachesPage({ params }: Props) {
  const [lang, roster] = await Promise.all([params.then((p) => siteLanguage(p.lang)), fetchRoster()]);
  return <CoachesContent lang={lang} roster={roster} />;
}
