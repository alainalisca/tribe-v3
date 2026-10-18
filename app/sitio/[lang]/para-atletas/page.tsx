import type { Metadata } from 'next';
import AthletesContent from '@/components/site/pages/AthletesContent';
import { siteLanguage } from '@/lib/site/i18n';
import { siteMetadata } from '@/lib/site/metadata';
import { siteCardPath } from '@/lib/site/paths';
import { fetchWeekBoard } from '@/lib/site/week';

/**
 * Page: /para-atletas/ (T-SITE1 Part E). Middleware serves it in the visitor's
 * language. Step 2 links to the soonest session on the live board (the same
 * cached query as Inicio's "La semana").
 */
type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = siteLanguage((await params).lang);
  return siteMetadata('para-atletas', '/para-atletas/', siteCardPath('para-atletas', lang), lang);
}

export default async function ParaAtletasPage({ params }: Props) {
  const [lang, week] = [siteLanguage((await params).lang), await fetchWeekBoard()];
  return <AthletesContent lang={lang} soonest={week[0]} />;
}
