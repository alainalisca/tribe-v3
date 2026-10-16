import { SiteImage, T } from '../T';
import b from '../base.module.css';
import s from './story.module.css';

const TILES = [
  { img: 'mos1', cls: 'm1', sizes: '(max-width: 860px) 100vw, 42vw' },
  { img: 'rowers', cls: 'm2', sizes: '(max-width: 860px) 100vw, 58vw', position: 'center 30%' },
  { img: 'barbell', cls: 'm3', sizes: '(max-width: 860px) 50vw, 25vw', position: 'center 35%' },
  { img: 'mos4', cls: 'm4', sizes: '(max-width: 860px) 50vw, 33vw' },
  { img: 'mos5', cls: 'm5', sizes: '(max-width: 860px) 100vw, 42vw' },
] as const satisfies ReadonlyArray<{ img: string; cls: keyof typeof s; sizes: string; position?: string }>;

/** "La gente es el plan.": the paper photo essay and its three pillars. */
export default function Essay() {
  return (
    <section className={`${s.essay} ${b.g}`} id="gente" aria-labelledby="gente-titulo">
      <div className={s.top}>
        <h2 id="gente-titulo" className={b.disp}>
          <T k="site.home.essayTitle1" />
          <br />
          <em>
            <T k="site.home.essayTitle2" />
          </em>
        </h2>
        <p>
          <T k="site.home.essayLede" />
        </p>
      </div>
      <div className={s.mosaic}>
        {TILES.map((tile) => (
          <figure key={tile.img} className={s[tile.cls]}>
            <SiteImage
              altKey={`site.alt.${tile.img}`}
              src={`/site/${tile.img}.jpg`}
              fill
              sizes={tile.sizes}
              style={'position' in tile ? { objectPosition: tile.position } : undefined}
            />
            <figcaption>
              <T k={`site.home.cap_${tile.img}`} />
            </figcaption>
          </figure>
        ))}
      </div>
      <div className={s.pillars}>
        {(['pillar1', 'pillar2', 'pillar3'] as const).map((p) => (
          <div key={p}>
            <h3>
              <T k={`site.home.${p}Title`} />
            </h3>
            <p>
              <T k={`site.home.${p}Body`} />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
