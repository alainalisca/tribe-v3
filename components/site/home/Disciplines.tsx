import Image from 'next/image';
import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { SITE_SPORT_COUNT } from '@/lib/site/sportCount';
import { SPORT_GROUPS } from '@/lib/site/sportGroups';
import { faceProps, photo, type PhotoKey } from '@/lib/site/photos';
import { ArrowUpRight } from '../icons';
import b from '../base.module.css';
import d from './doors.module.css';

/** "Combate" counts the combat group's sports except Boxing, which has its own row. */
const COMBAT_WITHOUT_BOXING: string[] = (SPORT_GROUPS.find((g) => g.key === 'combat')?.sports ?? []).filter(
  (s) => s !== 'Boxing'
);

/**
 * The six sports the mock leads with. A `*Key` is a message key (translated);
 * otherwise the literal is a name that reads the same in both languages.
 * `sports` are the stored sport keys whose sessions this week the row counts.
 */
type Row = { img: PhotoKey; word: string; wordKey?: string; where?: string; whereKey?: string; sports: string[] };
const ROWS: Row[] = [
  { img: 'row_hyrox', word: 'HYROX', where: 'BullBox', sports: ['HYROX'] },
  { img: 'row_cf', word: 'CrossFit', where: 'BullBox', sports: ['CrossFit'] },
  {
    img: 'row_box',
    word: 'Boxeo',
    wordKey: 'site.home.sportBoxing',
    whereKey: 'site.home.whereOutdoors',
    sports: ['Boxing'],
  },
  {
    img: 'row_comb',
    word: 'Combate',
    wordKey: 'site.home.sportCombat',
    where: 'Jiu-Jitsu · Muay Thai · Kickboxing',
    sports: COMBAT_WITHOUT_BOXING,
  },
  { img: 'row_run', word: 'Correr', wordKey: 'site.home.sportRunning', where: 'Ciudad del Río', sports: ['Running'] },
  {
    img: 'strip2',
    word: 'Calistenia',
    wordKey: 'site.home.sportCalisthenics',
    where: 'BullBox',
    sports: ['Calisthenics'],
  },
];

/**
 * "Elige tu deporte": the big type index with a photo peek on hover. Each row
 * says how many sessions it has this week ("10 esta semana"), or where it is
 * when none. On touch and narrow screens the rows become two tiles per row,
 * name and count, no thumbnail (T-SITE1.1 Part D).
 */
export default function Disciplines({ lang, counts }: { lang: SiteLanguage; counts: Record<string, number> }) {
  const t = siteT(lang);
  return (
    <section className={`${d.disc} ${b.g}`} id="deportes" aria-labelledby="deportes-titulo">
      <div className={d.dhead}>
        <h2 id="deportes-titulo" className={b.disp}>
          {t('site.home.sportsTitle1')}
          <br />
          {t('site.home.sportsTitle2')}
        </h2>
        <p className={b.phoneHide}>{t('site.home.sportsLede', { n: SITE_SPORT_COUNT })}</p>
      </div>
      <div className={d.dlist}>
        {ROWS.map((row) => (
          <Link key={row.img} className={d.drow} href="/deportes/">
            <span className={d.w}>{row.wordKey ? t(row.wordKey) : row.word}</span>
            {(() => {
              const n = row.sports.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
              return n > 0 ? (
                <span className={`${d.where} ${d.count}`}>{t('site.sports.thisWeek', { n })}</span>
              ) : (
                <span className={d.where}>{row.whereKey ? t(row.whereKey) : row.where}</span>
              );
            })()}
            <span className={d.arrow}>
              <ArrowUpRight />
            </span>
            <Image
              alt={t(`site.alt.${row.img}`)}
              className={d.peek}
              src={photo(row.img)}
              width={280}
              height={350}
              sizes="280px"
              {...faceProps(row.img)}
            />
          </Link>
        ))}
      </div>
      <div className={d.more}>
        <b className={b.phoneHide}>{t('site.home.moreSports', { more: SITE_SPORT_COUNT - ROWS.length })}</b>
        <Link className={b.ulink} href="/deportes/">
          {t('site.home.allSports', { n: SITE_SPORT_COUNT })}
        </Link>
      </div>
    </section>
  );
}
