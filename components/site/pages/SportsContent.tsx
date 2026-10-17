import Image from 'next/image';
import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { photo } from '@/lib/site/photos';
import { SITE_SPORT_COUNT } from '@/lib/site/sportCount';
import { SPORT_GROUPS } from '@/lib/site/sportGroups';
import { translateSport } from '@/lib/sportTranslationData';
import { ArrowRight } from '../icons';
import b from '../base.module.css';
import p from './pages.module.css';

/**
 * Page: /deportes/ (T-SITE1 Part E, mock "Deportes"). The app's sports in the
 * mock's six groups, as plain words: the feed does not filter by a ?sport=
 * parameter, so only "Busca una sesión" links (to /). Each "3 esta semana" chip
 * counts this week's sessions from the live board query, so the page is never
 * stale. "Other" reads "Tu deporte".
 */
export default function SportsContent({ lang, counts }: { lang: SiteLanguage; counts: Record<string, number> }) {
  const tr = siteT(lang);
  const t = (k: string, vars?: Record<string, string | number>) => tr(`site.sports.${k}`, vars);
  return (
    <section className={`${b.sec} ${b.g} ${p.top}`} aria-labelledby="pagina-titulo">
      <span className={`${b.mono} ${b.kick}`}>{t('kicker')}</span>
      <div className={b.sh}>
        <h1 id="pagina-titulo" className={`${b.disp} ${p.hTitle}`}>
          {t('title1', { n: SITE_SPORT_COUNT })}
          <br />
          <em>{t('title2')}</em>
        </h1>
        <p>{t('lede')}</p>
      </div>
      <div>
        {SPORT_GROUPS.map((g, i) => (
          <div key={g.key} className={p.sg}>
            <div className={p.gname}>
              <span className={`${b.mono} ${p.num}`}>{String(i + 1).padStart(2, '0')}</span>
              <h2>{t(g.key)}</h2>
            </div>
            <ul className={p.words}>
              {g.sports.map((s) => {
                const n = counts[s] ?? 0;
                return (
                  <li key={s} className={p.word}>
                    {translateSport(s, lang)}
                    {s === 'Other' ? (
                      <span className={p.count}>{t('yourSport')}</span>
                    ) : (
                      n > 0 && <span className={p.count}>{t('thisWeek', { n })}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {g.img && (
              <div className={p.pic}>
                <Image src={photo(g.img)} alt={tr(`site.alt.${g.img}`)} fill sizes="(max-width: 900px) 96px, 170px" />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className={p.centerCta}>
        <Link className={b.cta} href="/">
          {t('find')} <ArrowRight />
        </Link>
        <Link className={b.ulink} href="/coaches/">
          {t('publish')}
        </Link>
      </div>
    </section>
  );
}
