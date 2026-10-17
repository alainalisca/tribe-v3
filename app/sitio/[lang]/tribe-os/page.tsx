import type { Metadata } from 'next';
import OsContent from '@/components/site/pages/OsContent';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { photo } from '@/lib/site/photos';

/** Page: /tribe-os/ (T-SITE1 Part E). Middleware serves it in the visitor's language. */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata('tribe-os', '/tribe-os/', photo('hero_full'), siteLanguage((await params).lang));
}

export default async function TribeOsPage({ params }: Props) {
  return <OsContent lang={siteLanguage((await params).lang)} />;
}
