import Image from 'next/image';
import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { faceProps, photo } from '@/lib/site/photos';
import { SITE_SPORT_COUNT } from '@/lib/site/sportCount';
import { SPORT_GROUPS, type SportGroupKey } from '@/lib/site/sportGroups';
import type { WeekRow } from '@/lib/site/weekTypes';
import { translateSport } from '@/lib/sportTranslationData';
import { fixtureFromWeekRow, fixtureLabels } from '@/lib/site/fixture';
import FixtureRow from '../FixtureRow';
import { ArrowRight } from '../icons';
import Dotted from '../Dotted';
import b from '../base.module.css';
import w from '../week.module.css';
import p from './pages.module.css';

/**
 * A sport page (/deportes/boxeo/ and five more, T-SHARE1 Part B): the sport's
 * name in a sentence ("boxeo"), the group to open with, and this week's rows.
 */
export type SportFocus = { inline: string; group: SportGroupKey; rows: WeekRow[] };

/**
 * Page: /deportes/ (T-SITE1 Part E, mock "Deportes"). The app's sports in the
 * mock's six groups, as plain words: the feed does not filter by a ?sport=
 * parameter, so only "Busca una sesión" links (to /). Each "3 esta semana" chip
 * counts this week's sessions from the live board query, so the page is never
 * stale. "Other" reads "Tu deporte".
 */
export default function SportsContent({
  lang,
  counts,
  focus,
}: {
  lang: SiteLanguage;
  counts: Record<string, number>;
  focus?: SportFocus;
}) {
  const tr = siteT(lang);
  const t = (k: string, vars?: Record<string, string | number>) => tr(`site.sports.${k}`, vars);
  // A sport page opens on its own group; the others follow in their usual order.
  const groups = focus
    ? [...SPORT_GROUPS.filter((g) => g.key === focus.group), ...SPORT_GROUPS.filter((g) => g.key !== focus.group)]
    : SPORT_GROUPS;
  return (
    <section className={`${b.sec} ${b.g} ${p.top}`} aria-labelledby="pagina-titulo">
      <span className={`${b.mono} ${b.kick}`}>{t('kicker')}</span>
      <div className={b.sh}>
        <h1 id="pagina-titulo" className={`${b.disp} ${p.hTitle}`}>
          <Dotted text={t('title1', { n: SITE_SPORT_COUNT })} />
          <br />
          <em>
            <Dotted text={t('title2')} />
          </em>
        </h1>
        <p>{t('lede')}</p>
      </div>
      {focus && (
        <div className={p.sportWeek}>
          <h2>{t('weekTitle', { sport: focus.inline })}</h2>
          {focus.rows.length > 0 ? (
            <ul className={w.table}>
              {focus.rows.map((r) => (
                <FixtureRow key={r.id} fixture={fixtureFromWeekRow(r, lang)} labels={fixtureLabels(lang)} />
              ))}
            </ul>
          ) : (
            <div className={p.sportEmpty}>
              <p>{t('weekEmpty', { sport: focus.inline })}</p>
              <Link className={b.ulink} href="/coaches/">
                {tr('site.week.publishGo')}
              </Link>
            </div>
          )}
        </div>
      )}
      <div>
        {groups.map((g, i) => (
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
            {/* Team and racket, street: no photo of Al's yet, so no box at all
                (site polish: an empty "sin foto todavía" box read as broken). */}
            {g.img && (
              <div className={p.pic}>
                <Image
                  src={photo(g.img)}
                  alt={tr(`site.alt.${g.img}`)}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 900px) 96px, 170px"
                  {...faceProps(g.img)}
                />
                <span className={b.capTag}>{tr(`site.cap.${g.img}`)}</span>
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
