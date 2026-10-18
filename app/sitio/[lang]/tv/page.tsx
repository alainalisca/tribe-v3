import type { Metadata } from 'next';
import TvContent from '@/components/site/pages/TvContent';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { siteCardPath } from '@/lib/site/paths';

/** Page: /tv/ (T-SITE1 Part E). Middleware serves it in the visitor's language. */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = siteLanguage((await params).lang);
  return siteMetadata('tv', '/tv/', siteCardPath('tv', lang), lang);
}

export default async function TvPage({ params }: Props) {
  return <TvContent lang={siteLanguage((await params).lang)} />;
}
