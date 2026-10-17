import type { Metadata } from 'next';
import CoachesContent from '@/components/site/pages/CoachesContent';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { photo } from '@/lib/site/photos';

/**
 * Page: /coaches/ (T-SITE1 Part E). Middleware serves it in the visitor's
 * language; /for-instructors/ 301s here. The plan section renders only while
 * COACH_PLANS_ENABLED is on.
 */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata('coaches', '/coaches/', photo('hero_coach'), siteLanguage((await params).lang));
}

export default async function CoachesPage({ params }: Props) {
  return <CoachesContent lang={siteLanguage((await params).lang)} />;
}
