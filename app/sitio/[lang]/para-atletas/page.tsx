import type { Metadata } from 'next';
import StubPage from '@/components/site/StubPage';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';

/** Page: /para-atletas/ (T-SITE1). A stub until Part E; middleware serves it in the visitor's language. */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata('para-atletas', '/para-atletas/', '/site/hero_ath.jpg', siteLanguage((await params).lang));
}

export default async function ParaAtletasPage({ params }: Props) {
  return <StubPage lang={siteLanguage((await params).lang)} slug="para-atletas" />;
}
