import Image from 'next/image';
import Link from 'next/link';
import { EPISODES, UPCOMING_EPISODE, youtubeWatchUrl } from '@/lib/site/episodes';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { photo } from '@/lib/site/photos';
import { Play } from '../icons';
import b from '../base.module.css';
import v from './tv.module.css';

/**
 * Inicio's Tribe.TV block: the newest episode as a screen, the list beside it.
 * Links out to YouTube; the in-page player lives on /tv. Episode titles are
 * per-language fields of the episode record (lib/site/episodes.ts), not messages.
 */
export default function TvBlock({ lang }: { lang: SiteLanguage }) {
  const tr = siteT(lang);
  const t = (key: string) => tr(`site.home.${key}`);
  const [featured] = EPISODES;
  const meta = (e: (typeof EPISODES)[number]) => `${e.gym} · ${e.sport}`;

  return (
    <section className={`${v.tv} ${b.g}`} aria-labelledby="tv-titulo">
      <div className={v.tvhead}>
        <Link className={`${b.lock} ${v.tvLock}`} href="/tv/" id="tv-titulo" aria-label="Tribe.TV">
          <Image src={photo('logo_w')} alt="Tribe" width={194} height={64} sizes="194px" />
          <span>TV</span>
        </Link>
        <span className={`${b.mono} ${v.onair}`}>
          <i />
          {t('tvOnAir')}
        </span>
      </div>
      <div className={v.tvgrid}>
        <div>
          {/* The button sits below the thumbnail, never over it (T-SITE1.1 Part D). */}
          <a
            className={v.ep}
            href={youtubeWatchUrl(featured.id)}
            target="_blank"
            rel="noopener"
            aria-label={`${t('watchEpisode')}: ${featured.title[lang]}`}
          >
            <span className={v.screen}>
              <Image src={featured.thumb} alt={featured.alt[lang]} fill sizes="(max-width: 900px) 100vw, 62vw" />
            </span>
            <span className={v.play}>
              <Play />
              {t('watchEpisode')}
            </span>
          </a>
          <div className={v.epmeta}>
            <h3>{featured.title[lang]}</h3>
            <span className={`${b.mono} ${v.meta}`}>{meta(featured)}</span>
          </div>
        </div>
        <div>
          <div className={v.list}>
            {EPISODES.map((e, i) => (
              <a key={e.id} className={v.li} href={youtubeWatchUrl(e.id)} target="_blank" rel="noopener">
                <span className={v.n}>{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <h4>{e.title[lang]}</h4>
                  <small>{meta(e)}</small>
                </span>
              </a>
            ))}
            <div className={`${v.li} ${v.dim}`}>
              <span className={v.n}>{String(EPISODES.length + 1).padStart(2, '0')}</span>
              <span>
                <h4>{UPCOMING_EPISODE[lang]}</h4>
                <small>{t('comingSoon')}</small>
              </span>
            </div>
          </div>
          <Link className={`${b.ulink} ${v.subs}`} href="/tv/">
            {t('allAboutTv')}
          </Link>
        </div>
      </div>
    </section>
  );
}
