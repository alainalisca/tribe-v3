import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { CONTACT_EMAIL } from '@/lib/site/links';
import { SITE_SPORT_COUNT } from '@/lib/site/sportCount';
import b from '../base.module.css';
import Faq, { type FaqItem } from './Faq';
import p from './pages.module.css';

/**
 * Page: /preguntas/ (T-SITE1 Part E, mock "Preguntas"; /faq/ 301s here).
 *
 * The mock's two columns, merged with the old /faq content: the duplicate
 * refund question and the duplicate recurring-class questions are one each,
 * and the four money questions are one ("¿Cómo pago una sesión?"), which
 * states the money story once. The ClassPass question was removed (Al,
 * 2026-10-17).
 */
export default function FaqContent({ lang }: { lang: SiteLanguage }) {
  const tr = siteT(lang);
  const t = (k: string, vars?: Record<string, string | number>) => tr(`site.faq.${k}`, vars);
  const items = (prefix: 'a' | 'c' | 'u', count: number): FaqItem[] =>
    Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      const q = t(`${prefix}q${n}`);
      const text = t(`${prefix}a${n}`, { n: SITE_SPORT_COUNT });
      if (prefix === 'a' && n === 4)
        return {
          q,
          a: (
            <>
              {text}{' '}
              <Link className={b.ulink} href="/deportes/">
                {t('aa4link')}
              </Link>
            </>
          ),
        };
      if (prefix === 'c' && n === 6)
        return {
          q,
          a: (
            <>
              {text}{' '}
              <Link className={b.ulink} href="/tribe-os/#lista">
                {t('ca6link')}
              </Link>
            </>
          ),
        };
      return { q, a: text };
    });

  return (
    <section className={`${b.sec} ${b.g} ${p.top}`} aria-labelledby="pagina-titulo">
      <span className={`${b.mono} ${b.kick}`}>{t('kicker')}</span>
      <div className={b.sh}>
        <h1 id="pagina-titulo" className={`${b.disp} ${p.hTitle}`}>
          {t('title1')}
          <br />
          <em>{t('title2')}</em>
        </h1>
        <p>
          {t('lede')}{' '}
          <a className={b.ulink} href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
      <div className={p.faqcols}>
        <div>
          <h2 className={p.fqh}>{t('athletes')}</h2>
          <Faq items={items('a', 10)} firstOpen />
        </div>
        <div>
          <h2 className={p.fqh}>{t('coaches')}</h2>
          <Faq items={items('c', 6)} firstOpen />
          <h2 className={`${p.fqh} ${p.fqhNext}`}>{t('account')}</h2>
          <Faq items={items('u', 2)} />
        </div>
      </div>
    </section>
  );
}
