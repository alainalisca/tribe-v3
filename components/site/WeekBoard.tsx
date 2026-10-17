import Link from 'next/link';
import { translateSport } from '@/lib/sportTranslationData';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { DAYS, formatPrice, weekdayIndex } from '@/lib/site/weekFormat';
import type { WeekRow } from '@/lib/site/weekTypes';
import { ArrowRight } from './icons';
import b from './base.module.css';
import w from './week.module.css';

/**
 * "La semana": the next seven days of open sessions (Part B). Rows come from
 * the server (lib/site/week.ts); fewer than three rows adds one "Publica la
 * tuya" row for coaches. Sample rows are never rendered.
 */
export default function WeekBoard({ lang, rows }: { lang: SiteLanguage; rows: WeekRow[] }) {
  const tr = siteT(lang);
  const t = (key: string, vars?: Record<string, string | number>) => tr(`site.week.${key}`, vars);

  return (
    <section className={`${w.fx} ${b.g}`} id="semana" aria-labelledby="semana-titulo">
      <div className={w.fxhead}>
        <h2 id="semana-titulo" className={b.disp}>
          {t('title')}
        </h2>
        <p>{t('lede')}</p>
      </div>
      <ul className={w.table}>
        {rows.map((r) => {
          const sport = translateSport(r.sport, lang);
          return (
            <li key={r.id}>
              <Link className={w.row} href={`/s/${r.id}/`}>
                <span className={w.day}>{DAYS[lang][weekdayIndex(r.date)]}</span>
                <span className={w.hr}>{r.startTime}</span>
                <span className={w.ses}>
                  {r.title ?? sport}
                  {r.price === null && <span className={w.tag}>{t('free')}</span>}
                  {r.spotsLeft !== null && (
                    <span className={w.tag}>{t(r.spotsLeft === 1 ? 'spotsOne' : 'spots', { n: r.spotsLeft })}</span>
                  )}
                  <small>
                    {r.title ? `${sport} · ` : ''}
                    {r.duration} min{r.price ? ` · ${formatPrice(r.price, lang)}` : ''}
                  </small>
                </span>
                <span className={w.loc}>{r.place}</span>
                <span className={w.who}>{r.creatorName}</span>
                <span className={w.go}>
                  {t('ask')} <ArrowRight />
                </span>
              </Link>
            </li>
          );
        })}
        {rows.length < 3 && (
          <li>
            <Link className={`${w.row} ${w.publish}`} href="/coaches/">
              <span className={w.day}>+</span>
              <span className={w.hr} />
              <span className={w.ses}>
                {t('publishTitle')}
                <small>{t('publishBody')}</small>
              </span>
              <span className={w.loc} />
              <span className={w.who} />
              <span className={w.go}>
                {t('publishGo')} <ArrowRight />
              </span>
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
