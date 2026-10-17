import Image from 'next/image';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { SITE_SPORT_COUNT } from '@/lib/site/sportCount';
import { faceProps, photo, type PhotoKey } from '@/lib/site/photos';
import b from '../base.module.css';
import s from './story.module.css';

/**
 * Four places (T-SITE1.1 Part B): BullBox, Zona de Combate, the park and the
 * terrace. The fourth tile is the 4:5 yoga portrait; its row takes its height.
 */
const TILES = [
  { img: 'essay_bb', cls: 'm1', sizes: '(max-width: 860px) 50vw, 42vw' },
  { img: 'essay_zona', cls: 'm5', sizes: '(max-width: 860px) 50vw, 58vw' },
  { img: 'essay_wil', cls: 'm3', sizes: '(max-width: 860px) 50vw, 66vw' },
  { img: 'essay_yoga', cls: 'm4', sizes: '(max-width: 860px) 50vw, 34vw' },
] as const satisfies ReadonlyArray<{ img: PhotoKey; cls: keyof typeof s; sizes: string }>;

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
              {...faceProps(tile.img)}
            />
            <figcaption>{t(`site.cap.${tile.img}`)}</figcaption>
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
