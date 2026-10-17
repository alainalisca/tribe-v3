import type { Metadata } from 'next';
import StubPage from '@/components/site/StubPage';
import GymGrowth from '@/components/site/plans/GymGrowth';
import { coachPlansEnabled } from '@/lib/site/flags';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { photo } from '@/lib/site/photos';

/**
 * Page: /gimnasios/ (T-SITE1). A stub until Part E; middleware serves it in the visitor's language.
 * Part D: the plan section renders only while COACH_PLANS_ENABLED is on.
 */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata('gimnasios', '/gimnasios/', photo('hero_gym'), siteLanguage((await params).lang));
}

export default async function GimnasiosPage({ params }: Props) {
  const lang = siteLanguage((await params).lang);
  return (
    <>
      <StubPage lang={lang} slug="gimnasios" />
      {coachPlansEnabled() && <GymGrowth lang={lang} />}
    </>
  );
}
