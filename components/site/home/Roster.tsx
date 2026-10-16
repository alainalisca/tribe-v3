import Link from 'next/link';
import { EPISODES } from '@/lib/site/episodes';
import { SiteImage, T } from '../T';
import b from '../base.module.css';
import s from './story.module.css';

/**
 * Coaches with name and face. Names, handles and places are proper nouns, the
 * same in both languages; the sport line and alt text are translated.
 * pad_tall is the one Salomón photo allowed on Inicio.
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
  { img: 'ro_andres', sport: 'CrossFit · HYROX', name: 'Andrés Varón', where: 'BullBox · Ciudad del Río', href: '/coaches/' },
  { img: 'ro_alex', sportKey: 'site.home.sportYoga', name: 'Alexandra Aguirre', where: 'El Poblado · Envigado · @aleyoga_med', href: '/coaches/' },
  { img: 'pad_tall', sportKey: 'site.home.sportBoxMuay', name: 'Salomón Tabares', whereKey: 'site.home.whereSalomon', href: '/coaches/', position: 'center 25%' },
  { img: 'ro_wil', sportKey: 'site.home.sportCombat', name: 'Profe Wil', where: 'Zona de Combate · @fightwil', href: '/tv/' },
];

const FACTS = [
  { value: '22', key: 'factSports' },
  { value: '3', key: 'factPartners' },
  { value: String(EPISODES.length), key: 'factEpisodes' },
] as const;

export default function Roster() {
  return (
    <section className={`${b.sec} ${b.g}`} aria-labelledby="coaches-titulo">
      <div className={s.facts}>
        {FACTS.map((f) => (
          <div key={f.key}>
            <b>{f.value}</b>
            <span>
              <T k={`site.home.${f.key}`} />
            </span>
          </div>
        ))}
        <div>
          <b>
            <T k="site.home.factFreeValue" />
          </b>
          <span>
            <T k="site.home.factFree" />
          </span>
        </div>
      </div>
      <div className={`${b.sh} ${s.rosterHead}`}>
        <h2 id="coaches-titulo" className={b.disp}>
          <T k="site.home.rosterTitle1" />
          <br />
          <T k="site.home.rosterTitle2" />
        </h2>
        <p>
          <T k="site.home.rosterLede" />
        </p>
      </div>
      <div className={s.roster}>
        {COACHES.map((c) => (
          <Link key={c.img} href={c.href}>
            <figure>
              <SiteImage
                altKey={`site.alt.${c.img}`}
                src={`/site/${c.img}.jpg`}
                fill
                sizes="(max-width: 900px) 50vw, 25vw"
                style={c.position ? { objectPosition: c.position } : undefined}
              />
            </figure>
            <span className={`${b.mono} ${s.sport}`}>{c.sportKey ? <T k={c.sportKey} /> : c.sport}</span>
            <h3>{c.name}</h3>
            <p>{c.whereKey ? <T k={c.whereKey} /> : c.where}</p>
          </Link>
        ))}
      </div>
      <p className={b.note}>
        <T k="site.home.rosterNote" />
      </p>
    </section>
  );
}
