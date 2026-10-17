import type { Metadata } from 'next';
import FaqContent from '@/components/site/pages/FaqContent';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { photo } from '@/lib/site/photos';

/** Page: /preguntas/ (T-SITE1 Part E). Middleware serves it in the visitor's language; /faq/ 301s here. */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return siteMetadata('preguntas', '/preguntas/', photo('close_team'), siteLanguage((await params).lang));
}

export default async function PreguntasPage({ params }: Props) {
  return <FaqContent lang={siteLanguage((await params).lang)} />;
}
