import type { Metadata } from 'next';
import OsContent from '@/components/site/pages/OsContent';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { siteCardPath } from '@/lib/site/paths';

/** Page: /tribe-os/ (T-SITE1 Part E). Middleware serves it in the visitor's language. */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = siteLanguage((await params).lang);
  return siteMetadata('tribe-os', '/tribe-os/', siteCardPath('tribe-os', lang), lang);
}

export default async function TribeOsPage({ params }: Props) {
  return <OsContent lang={siteLanguage((await params).lang)} />;
}
