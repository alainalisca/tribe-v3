'use client';

import Image from 'next/image';
import Link from 'next/link';
import { EPISODES, UPCOMING_EPISODE, youtubeWatchUrl } from '@/lib/site/episodes';
import { useSiteLanguage, useSiteT } from '@/lib/site/useSiteT';
import { Play } from '../icons';
import b from '../base.module.css';
import v from './tv.module.css';

/**
 * Inicio's Tribe.TV block: the newest episode as a screen, the list beside it.
 * Links out to YouTube; the in-page player lives on /tv. Client only because
 * episode titles are per-language fields of the episode record
 * (lib/site/episodes.ts), not messages.
 */
export default function TvBlock() {
  const lang = useSiteLanguage();
  const t = useSiteT('site.home');
  const [featured] = EPISODES;
  const meta = (e: (typeof EPISODES)[number]) => `${e.gym} · ${e.sport}`;

  return (
    <section className={`${v.tv} ${b.g}`} aria-labelledby="tv-titulo">
      <div className={v.tvhead}>
        <Link className={`${b.lock} ${v.tvLock}`} href="/tv/" id="tv-titulo" aria-label="Tribe.TV">
          <Image src="/tribe-wordmark.png" alt="" width={194} height={64} sizes="194px" />
          <span>TV</span>
        </Link>
        <span className={`${b.mono} ${v.onair}`}>
          <i />
          {t('tvOnAir')}
        </span>
      </div>
      <div className={v.tvgrid}>
        <div>
          <a
            className={v.screen}
            href={youtubeWatchUrl(featured.id)}
            target="_blank"
            rel="noopener"
            aria-label={`${t('watch')}: ${featured.title[lang]}`}
          >
            <Image src={featured.thumb} alt={featured.alt[lang]} fill sizes="(max-width: 900px) 100vw, 62vw" />
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
