import Image from 'next/image';
import Link from 'next/link';
import { EPISODES } from '@/lib/site/episodes';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import b from '../base.module.css';
import s from './story.module.css';

/**
 * Coaches with name and face. Names, handles and places are proper nouns, the
 * same in both languages; the sport line and alt text are translated.
 * pad_tall is the one Salomón photo allowed on Inicio. Four across on desktop,
 * a horizontal scroller on phones.
 */
type Coach = {
  img: string;
  name: string;
  href: string;
  sport?: string;
  sportKey?: string;
  where?: string;
  whereKey?: string;
  position?: string;
};
const COACHES: Coach[] = [
  {
    img: 'ro_andres',
    sport: 'CrossFit · HYROX',
    name: 'Andrés Varón',
    where: 'BullBox · Ciudad del Río',
    href: '/coaches/',
  },
  {
    img: 'ro_alex',
    sportKey: 'site.home.sportYoga',
    name: 'Alexandra Aguirre',
    where: 'El Poblado · Envigado · @aleyoga_med',
    href: '/coaches/',
  },
  {
    img: 'pad_tall',
    sportKey: 'site.home.sportBoxMuay',
    name: 'Salomón Tabares',
    whereKey: 'site.home.whereSalomon',
    href: '/coaches/',
    position: 'center 25%',
  },
  {
    img: 'ro_wil',
    sportKey: 'site.home.sportCombat',
    name: 'Profe Wil',
    where: 'Zona de Combate · @fightwil',
    href: '/tv/',
  },
];

const FACTS = [
  { value: '22', key: 'factSports' },
  { value: '3', key: 'factPartners' },
  { value: String(EPISODES.length), key: 'factEpisodes' },
] as const;

export default function Roster({ lang }: { lang: SiteLanguage }) {
  const t = siteT(lang);
  return (
    <section className={`${b.sec} ${b.g}`} aria-labelledby="coaches-titulo">
      <div className={s.facts}>
        {FACTS.map((f) => (
          <div key={f.key}>
            <b>{f.value}</b>
            <span>{t(`site.home.${f.key}`)}</span>
          </div>
        ))}
        <div>
          <b>{t('site.home.factFreeValue')}</b>
          <span>{t('site.home.factFree')}</span>
        </div>
      </div>
      <div className={`${b.sh} ${s.rosterHead}`}>
        <h2 id="coaches-titulo" className={b.disp}>
          {t('site.home.rosterTitle1')}
          <br />
          {t('site.home.rosterTitle2')}
        </h2>
        <p className={b.phoneHide}>{t('site.home.rosterLede')}</p>
      </div>
      <div className={s.roster} role="list">
        {COACHES.map((c) => (
          <Link key={c.img} href={c.href} role="listitem">
            <figure>
              <Image
                alt={t(`site.alt.${c.img}`)}
                src={`/site/${c.img}.jpg`}
                fill
                sizes="(max-width: 900px) 62vw, 25vw"
                style={c.position ? { objectPosition: c.position } : undefined}
              />
            </figure>
            <span className={`${b.mono} ${s.sport}`}>{c.sportKey ? t(c.sportKey) : c.sport}</span>
            <h3>{c.name}</h3>
            <p>{c.whereKey ? t(c.whereKey) : c.where}</p>
          </Link>
        ))}
      </div>
      <p className={`${b.note} ${s.rosterNote}`}>{t('site.home.rosterNote')}</p>
    </section>
  );
}
