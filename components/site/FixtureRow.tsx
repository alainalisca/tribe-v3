import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { daysLabel, rowTitle } from '@/lib/site/weekBoard';
import { formatPrice } from '@/lib/site/weekFormat';
import type { WeekRow } from '@/lib/site/weekTypes';
import { translateSport } from '@/lib/sportTranslationData';
import { ArrowRight } from './icons';
import w from './week.module.css';

/**
 * One session row of "La semana" (Part B): days, time, title with its tags,
 * place, coach, "Pedir cupo". Also the rows of a sport page's week block
 * (T-SHARE1), inside the same `w.table` list, and of the coach page (Part E),
 * in a `w.paper` table, with `action` "Reserva" and, for a session past this
 * week, `day` as its date.
 */
export default function FixtureRow({
  lang,
  row: r,
  action,
  day,
}: {
  lang: SiteLanguage;
  row: WeekRow;
  action?: string;
  day?: string;
}) {
  const t = siteT(lang);
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
    <li>
      {/* No aria-label (Al, 2026-10-17): the row's visible text is its name, so
          a voice-control user can say any of it (WCAG 2.5.3). */}
      <Link className={w.row} href={`/s/${r.id}/`}>
        <span className={w.day}>{day ?? daysLabel(r.weekdays, lang)}</span>
        <span className={w.hr}>{r.startTime}</span>
        <span className={w.ses}>
          {title}
          <span className={w.tags}>{tags}</span>
          <small>
            {r.title && sport ? `${sport} · ` : ''}
            {r.duration} min{r.price ? ` · ${formatPrice(r.price, lang)}` : ''}
          </small>
        </span>
        <span className={w.loc}>
          {r.place}
          <span className={w.tagsPhone}>{tags}</span>
        </span>
        <span className={w.who}>{r.creatorName}</span>
        <span className={w.go}>
          {action ?? t('site.week.ask')} <ArrowRight />
        </span>
      </Link>
    </li>
  );
}
