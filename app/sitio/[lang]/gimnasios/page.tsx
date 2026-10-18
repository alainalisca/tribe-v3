import type { Metadata } from 'next';
import GymsContent from '@/components/site/pages/GymsContent';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { siteCardPath } from '@/lib/site/paths';

/**
 * Page: /gimnasios/ (T-SITE1 Part E). Middleware serves it in the visitor's
 * language. Plan content (deliverables, prices, WhatsApp) renders only while
 * COACH_PLANS_ENABLED is on.
 */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = siteLanguage((await params).lang);
  return siteMetadata('gimnasios', '/gimnasios/', siteCardPath('gimnasios', lang), lang);
}

export default async function GimnasiosPage({ params }: Props) {
  return <GymsContent lang={siteLanguage((await params).lang)} />;
}
