import type { Metadata } from 'next';
import TvContent from '@/components/site/pages/TvContent';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { photo } from '@/lib/site/photos';

/** Page: /tv/ (T-SITE1 Part E). Middleware serves it in the visitor's language. */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata('tv', '/tv/', photo('tv_wod'), siteLanguage((await params).lang));
}

export default async function TvPage({ params }: Props) {
  return <TvContent lang={siteLanguage((await params).lang)} />;
}
