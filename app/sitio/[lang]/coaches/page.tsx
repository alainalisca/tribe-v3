import type { Metadata } from 'next';
import StubPage from '@/components/site/StubPage';
import CoachPlans from '@/components/site/plans/CoachPlans';
import { coachPlansEnabled } from '@/lib/site/flags';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { photo } from '@/lib/site/photos';

/**
 * Page: /coaches/ (T-SITE1). A stub until Part E; middleware serves it in the visitor's language.
 * Part D: the plan section renders only while COACH_PLANS_ENABLED is on.
 */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata('coaches', '/coaches/', photo('hero_coach'), siteLanguage((await params).lang));
}

export default async function CoachesPage({ params }: Props) {
  const lang = siteLanguage((await params).lang);
  return (
    <>
      <StubPage lang={lang} slug="coaches" />
      {coachPlansEnabled() && <CoachPlans lang={lang} />}
    </>
  );
}
