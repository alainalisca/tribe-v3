import type { Metadata } from 'next';
import FaqContent from '@/components/site/pages/FaqContent';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { siteCardPath } from '@/lib/site/paths';

/** Page: /preguntas/ (T-SITE1 Part E). Middleware serves it in the visitor's language; /faq/ 301s here. */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = siteLanguage((await params).lang);
  return siteMetadata('preguntas', '/preguntas/', siteCardPath('preguntas', lang), lang);
}

export default async function PreguntasPage({ params }: Props) {
  return <FaqContent lang={siteLanguage((await params).lang)} />;
}
