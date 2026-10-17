import Image from 'next/image';
import Link from 'next/link';
import { EPISODES, UPCOMING_EPISODE, youtubeWatchUrl } from '@/lib/site/episodes';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { TV_CHANNEL_URL } from '@/lib/site/links';
import { photo } from '@/lib/site/photos';
import LitePlayer from '../LitePlayer';
import b from '../base.module.css';
import v from '../home/tv.module.css';
import p from './pages.module.css';

/**
 * Page: /tv/ (T-SITE1 Part E, mock "Tribe.TV"). Every episode in
 * lib/site/episodes.ts as a lite player (thumbnail first, YouTube only on
 * tap), newest first and featured; the list with the announced episode; the
 * subscribe link; a note for coaches. The page's <h1> is the Tribe.TV lockup.
 */
export default function TvContent({ lang }: { lang: SiteLanguage }) {
  const tr = siteT(lang);
  const t = (k: string) => tr(`site.tv.${k}`);
  const meta = (e: (typeof EPISODES)[number]) => `${e.gym} · ${e.sport}`;
  return (
    <section className={`${v.tv} ${v.full} ${b.g} ${p.top}`} aria-labelledby="pagina-titulo">
      <div className={v.tvhead}>
        <h1 id="pagina-titulo" className={`${b.lock} ${v.tvLock}`}>
          <Image src={photo('logo_w')} alt="Tribe" width={194} height={64} sizes="194px" />
          <span>TV</span>
        </h1>
        <span className={`${b.mono} ${v.onair}`}>
          <i />
          {t('onAir')}
        </span>
      </div>
      <p className={v.intro}>{t('intro')}</p>
      <div className={v.tvgrid}>
        <div>
          {EPISODES.map((e, i) => (
            <div key={e.id}>
              <LitePlayer
                id={e.id}
                title={e.title[lang]}
                thumb={e.thumb}
                alt={e.alt[lang]}
                playLabel={t('play')}
                priority={i === 0}
              />
              <div className={v.epmeta}>
                <h2>{e.title[lang]}</h2>
                <span className={`${b.mono} ${v.meta}`}>{meta(e)}</span>
              </div>
            </div>
          ))}
        </div>
        <div>
          <ol className={v.list}>
            {EPISODES.map((e, i) => (
              <li key={e.id}>
                <a className={v.li} href={youtubeWatchUrl(e.id)} target="_blank" rel="noopener">
                  <span className={v.n}>{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <h3>{e.title[lang]}</h3>
                    <small>{meta(e)}</small>
                  </span>
                </a>
              </li>
            ))}
            <li className={`${v.li} ${v.dim}`}>
              <span className={v.n}>{String(EPISODES.length + 1).padStart(2, '0')}</span>
              <span>
                <h3>{UPCOMING_EPISODE[lang]}</h3>
                <small>{t('soon')}</small>
              </span>
            </li>
          </ol>
          <a
            className={`${b.ulink} ${v.subs}`}
            href={`${TV_CHANNEL_URL}?sub_confirmation=1`}
            target="_blank"
            rel="noopener"
          >
            {t('subscribe')}
          </a>
          <div className={v.coachBox}>
            <span className={`${b.mono} ${b.kick}`}>{t('coachKick')}</span>
            <p>{t('coachBody')}</p>
            <Link className={b.ulink} href="/coaches/">
              {t('coachLink')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
