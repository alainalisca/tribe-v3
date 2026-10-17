import type { Metadata } from 'next';
import GymsContent from '@/components/site/pages/GymsContent';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { photo } from '@/lib/site/photos';

/**
 * Page: /gimnasios/ (T-SITE1 Part E). Middleware serves it in the visitor's
 * language. Plan content (deliverables, prices, WhatsApp) renders only while
 * COACH_PLANS_ENABLED is on.
 */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata('gimnasios', '/gimnasios/', photo('gym_hero'), siteLanguage((await params).lang));
}

export default async function GimnasiosPage({ params }: Props) {
  return <GymsContent lang={siteLanguage((await params).lang)} />;
}
