import Image from 'next/image';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { SITE_SPORT_COUNT } from '@/lib/site/sportCount';
import { photo, type PhotoKey } from '@/lib/site/photos';
import b from '../base.module.css';
import s from './story.module.css';

/**
 * At most six tiles. "rowers" was removed 2026-10-16 (not Al's photo); its
 * slot stays empty until Al approves a replacement (n_j0590.jpg is flagged).
 */
const TILES = [
  { img: 'mos1', cls: 'm1', sizes: '(max-width: 860px) 50vw, 42vw' },
  { img: 'mos5', cls: 'm5', sizes: '(max-width: 860px) 50vw, 58vw' },
  { img: 'barbell', cls: 'm3', sizes: '(max-width: 860px) 50vw, 50vw', position: 'center 35%' },
  { img: 'mos4', cls: 'm4', sizes: '(max-width: 860px) 50vw, 50vw' },
] as const satisfies ReadonlyArray<{ img: PhotoKey; cls: keyof typeof s; sizes: string; position?: string }>;

/** "La gente es el plan.": the paper photo essay and its three pillars. */
export default function Essay({ lang }: { lang: SiteLanguage }) {
  const t = siteT(lang);
  return (
    <section className={`${s.essay} ${b.g}`} id="gente" aria-labelledby="gente-titulo">
      <div className={s.top}>
        <h2 id="gente-titulo" className={b.disp}>
          {t('site.home.essayTitle1')}
          <br />
          <em>{t('site.home.essayTitle2')}</em>
        </h2>
        <p>{t('site.home.essayLede')}</p>
      </div>
      <div className={s.mosaic}>
        {TILES.map((tile) => (
          <figure key={tile.img} className={s[tile.cls]}>
            <Image
              alt={t(`site.alt.${tile.img}`)}
              src={photo(tile.img)}
              fill
              sizes={tile.sizes}
              style={'position' in tile ? { objectPosition: tile.position } : undefined}
            />
            <figcaption>{t(`site.home.cap_${tile.img}`)}</figcaption>
          </figure>
        ))}
      </div>
      <div className={s.pillars}>
        {(['pillar1', 'pillar2', 'pillar3'] as const).map((p) => (
          <div key={p}>
            <h3>{t(`site.home.${p}Title`)}</h3>
            <p>{t(`site.home.${p}Body`, { n: SITE_SPORT_COUNT })}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
