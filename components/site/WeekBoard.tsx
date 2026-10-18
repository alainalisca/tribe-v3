import Link from 'next/link';
import { CANONICAL_SITE_URL } from '@/lib/http/siteUrl';
import { serializeJsonLd } from '@/lib/seo/jsonLd';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { WEEK_BOARD_MAX } from '@/lib/site/weekBoard';
import { weekBoardJsonLd } from '@/lib/site/weekJsonLd';
import type { WeekRow } from '@/lib/site/weekTypes';
import { fixtureFromWeekRow, fixtureLabels } from '@/lib/site/fixture';
import FixtureRow from './FixtureRow';
import { ArrowRight } from './icons';
import b from './base.module.css';
import w from './week.module.css';

/**
 * "La semana": the next seven days of open sessions (Part B), one row per
 * series with its days ("Lun a vie · 06:00"), at most eight, two per sport and
 * one per coach (lib/site/weekBoard). Rows come from the server (lib/site/week.ts); fewer than three adds
 * one "Publica la tuya" row for coaches. Sample rows are never rendered. The
 * rows are also emitted as an ItemList of Events for search engines.
 */
export default function WeekBoard({ lang, rows }: { lang: SiteLanguage; rows: WeekRow[] }) {
  const t = siteT(lang);
  const shown = rows.slice(0, WEEK_BOARD_MAX);
  const labels = fixtureLabels(lang);
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
        {shown.map((r) => (
          <FixtureRow key={r.id} fixture={fixtureFromWeekRow(r, lang)} labels={labels} />
        ))}
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
