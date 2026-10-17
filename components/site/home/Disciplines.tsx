import Image from 'next/image';
import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { ArrowUpRight } from '../icons';
import b from '../base.module.css';
import d from './doors.module.css';

/**
 * The six sports the mock leads with. A `*Key` is a message key (translated);
 * otherwise the literal is a name that reads the same in both languages.
 */
type Row = { img: string; word: string; wordKey?: string; where?: string; whereKey?: string };
const ROWS: Row[] = [
  { img: 'row_hyrox', word: 'HYROX', where: 'BullBox' },
  { img: 'row_cf', word: 'CrossFit', where: 'BullBox' },
  { img: 'row_box', word: 'Boxeo', wordKey: 'site.home.sportBoxing', whereKey: 'site.home.whereOutdoors' },
  { img: 'row_comb', word: 'Combate', wordKey: 'site.home.sportCombat', where: 'Jiu-Jitsu · Muay Thai · Kickboxing' },
  { img: 'row_run', word: 'Correr', wordKey: 'site.home.sportRunning', where: 'Ciudad del Río' },
  { img: 'row_yoga', word: 'Yoga', whereKey: 'site.home.whereTerrace' },
];

/**
 * "Elige tu deporte": the big type index with a photo peek on hover. On touch
 * and narrow screens the rows become a two-column chip grid (thumbnail + name).
 */
export default function Disciplines({ lang }: { lang: SiteLanguage }) {
  const t = siteT(lang);
  return (
    <section className={`${d.disc} ${b.g}`} id="deportes" aria-labelledby="deportes-titulo">
      <div className={d.dhead}>
        <h2 id="deportes-titulo" className={b.disp}>
          {t('site.home.sportsTitle1')}
          <br />
          {t('site.home.sportsTitle2')}
        </h2>
        <p className={b.phoneHide}>{t('site.home.sportsLede')}</p>
      </div>
      <div className={d.dlist}>
        {ROWS.map((row) => (
          <Link key={row.img} className={d.drow} href="/deportes/">
            <Image alt="" className={d.thumb} src={`/site/${row.img}.jpg`} width={76} height={92} sizes="76px" />
            <span className={d.w}>{row.wordKey ? t(row.wordKey) : row.word}</span>
            <span className={d.where}>{row.whereKey ? t(row.whereKey) : row.where}</span>
            <span className={d.arrow}>
              <ArrowUpRight />
            </span>
            <Image
              alt={t(`site.alt.${row.img}`)}
              className={d.peek}
              src={`/site/${row.img}.jpg`}
              width={280}
              height={350}
              sizes="280px"
            />
          </Link>
        ))}
      </div>
      <div className={d.more}>
        <b className={b.phoneHide}>{t('site.home.moreSports')}</b>
        <Link className={b.ulink} href="/deportes/">
          {t('site.home.allSports')}
        </Link>
      </div>
    </section>
  );
}
