import type { Metadata } from 'next';
import StubPage from '@/components/site/StubPage';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { photo } from '@/lib/site/photos';

/** Page: /tv/ (T-SITE1). A stub until Part E; middleware serves it in the visitor's language. */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata('tv', '/tv/', photo('tv_wod'), siteLanguage((await params).lang));
}

export default async function TvPage({ params }: Props) {
  return <StubPage lang={siteLanguage((await params).lang)} slug="tv" />;
}
