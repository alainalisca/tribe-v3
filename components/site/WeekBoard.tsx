import Link from 'next/link';
import { CANONICAL_SITE_URL } from '@/lib/http/siteUrl';
import { serializeJsonLd } from '@/lib/seo/jsonLd';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { daysLabel, rowTitle, WEEK_BOARD_MAX } from '@/lib/site/weekBoard';
import { weekBoardJsonLd } from '@/lib/site/weekJsonLd';
import { formatPrice } from '@/lib/site/weekFormat';
import type { WeekRow } from '@/lib/site/weekTypes';
import { translateSport } from '@/lib/sportTranslationData';
import { ArrowRight } from './icons';
import b from './base.module.css';
import w from './week.module.css';

/**
 * "La semana": the next seven days of open sessions (Part B), one row per
 * series with its days ("Lun a vie · 06:00"), at most eight, as many coaches as
 * possible. Rows come from the server (lib/site/week.ts); fewer than three adds
 * one "Publica la tuya" row for coaches. Sample rows are never rendered. The
 * rows are also emitted as an ItemList of Events for search engines.
 */
export default function WeekBoard({ lang, rows }: { lang: SiteLanguage; rows: WeekRow[] }) {
  const t = siteT(lang);
  const shown = rows.slice(0, WEEK_BOARD_MAX);
  const jsonLd = weekBoardJsonLd(shown, lang, CANONICAL_SITE_URL);

  return (
    <section className={`${w.fx} ${b.g}`} id="semana" aria-labelledby="semana-titulo">
      <div className={w.fxhead}>
        <h2 id="semana-titulo" className={b.disp}>
          {t('site.week.title')}
        </h2>
        <p className={b.phoneHide}>{t('site.week.lede')}</p>
      </div>
      <ul className={w.table}>
        {shown.map((r) => {
          const sport = translateSport(r.sport, lang);
          const title = rowTitle(r, lang);
          // Rendered twice: after the title on wide screens, on the place line on
          // phones; the hidden copy is display:none, so it is read once.
          const tags = (
            <>
              {r.price === null ? (
                <span className={w.tag}>{t('site.week.free')}</span>
              ) : (
                <span className={`${w.tag} ${w.priceTag}`}>{formatPrice(r.price, lang)}</span>
              )}
              {r.spotsLeft !== null && (
                <span className={w.tag}>
                  {r.spotsLeft === 1 ? t('site.week.spotsOne') : t('site.week.spots', { n: r.spotsLeft })}
                </span>
              )}
            </>
          );
          return (
            <li key={r.id}>
              {/* Named "<title>: pedir cupo" (Al, 2026-10-17), so the name starts with the
                  visible title. The aria-label replaces the content for assistive tech,
                  so the details around the title are aria-hidden: the visible text left
                  (title, "Pedir cupo") is then contained in the name, as WCAG 2.5.3 asks. */}
              <Link
                className={w.row}
                href={`/s/${r.id}/`}
                aria-label={`${title}: ${t('site.week.ask').toLocaleLowerCase(lang)}`}
              >
                <span className={w.day} aria-hidden="true">
                  {daysLabel(r.weekdays, lang)}
                </span>
                <span className={w.hr} aria-hidden="true">
                  {r.startTime}
                </span>
                <span className={w.ses}>
                  {title}
                  <span className={w.tags} aria-hidden="true">
                    {tags}
                  </span>
                  <small aria-hidden="true">
                    {r.title && sport ? `${sport} · ` : ''}
                    {r.duration} min{r.price ? ` · ${formatPrice(r.price, lang)}` : ''}
                  </small>
                </span>
                <span className={w.loc} aria-hidden="true">
                  {r.place}
                  <span className={w.tagsPhone}>{tags}</span>
                </span>
                <span className={w.who} aria-hidden="true">
                  {r.creatorName}
                </span>
                <span className={w.go}>
                  {t('site.week.ask')} <ArrowRight />
                </span>
              </Link>
            </li>
          );
        })}
        {shown.length < 3 && (
          <li>
            <Link className={`${w.row} ${w.publish}`} href="/coaches/">
              <span className={w.day}>+</span>
              <span className={w.hr} />
              <span className={w.ses}>
                {t('site.week.publishTitle')}
                <small>{t('site.week.publishBody')}</small>
              </span>
              <span className={w.loc} />
              <span className={w.who} />
              <span className={w.go}>
                {t('site.week.publishGo')} <ArrowRight />
              </span>
            </Link>
          </li>
        )}
      </ul>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />}
    </section>
  );
}
