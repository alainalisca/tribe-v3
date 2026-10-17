import Image from 'next/image';
import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/site/links';
import { photo } from '@/lib/site/photos';
import type { WeekRow } from '@/lib/site/weekTypes';
import { ArrowRight } from '../icons';
import StoreButton from '../StoreButton';
import b from '../base.module.css';
import PageHero from './PageHero';
import Steps from './Steps';
import p from './pages.module.css';

const STRIP = [
  { img: 'strip1', cap: 'cap1' },
  { img: 'strip2', cap: 'cap2' },
  { img: 'strip3', cap: 'cap3' },
] as const;

/**
 * Page: /para-atletas/ (T-SITE1 Part E, mock "Atletas"). Not /atletas, which
 * is the Tribe Athletes program (T-AV).
 *
 * The steps link as the spec says: 1 to the week on Inicio, 2 to the soonest
 * live session's share page (the week when there is none), 3 to the store.
 * The feature grid lists only what ships today: sessions, series, session
 * chat, the free pass and verified coaches. Challenges and streaks are frozen
 * and not listed. The money story is stated once, in "Sesiones".
 */
export default function AthletesContent({ lang, soonest }: { lang: SiteLanguage; soonest: WeekRow | undefined }) {
  const tr = siteT(lang);
  const t = (k: string) => tr(`site.athletes.${k}`);
  return (
    <>
      <PageHero
        img="hero_ath"
        alt={tr('site.alt.hero_ath')}
        tag={t('tag')}
        title1={t('title1')}
        title2={t('title2')}
        ledeStrong={t('ledeStrong')}
        ledeRest={t('ledeRest')}
      >
        <StoreButton className={b.cta}>
          {t('download')} <ArrowRight />
        </StoreButton>
        <Link className={b.ulink} href="/deportes/">
          {t('seeSports')}
        </Link>
      </PageHero>

      <section className={`${b.sec} ${b.g}`} aria-labelledby="como-funciona">
        <div className={b.sh}>
          <h2 id="como-funciona" className={b.disp}>
            {t('howTitle')}
          </h2>
          <p>{t('howLede')}</p>
        </div>
        <Steps
          steps={[
            {
              title: t('step1Title'),
              body: t('step1Body'),
              extra: (
                <Link className={`${b.ulink} ${p.stepLink}`} href="/#semana">
                  {t('step1Link')}
                </Link>
              ),
            },
            {
              title: t('step2Title'),
              body: t('step2Body'),
              extra: (
                <Link className={`${b.ulink} ${p.stepLink}`} href={soonest ? `/s/${soonest.id}/` : '/#semana'}>
                  {t('step2Link')}
                </Link>
              ),
            },
            {
              title: t('step3Title'),
              body: t('step3Body'),
              extra: <StoreButton className={`${b.ulink} ${p.stepLink}`}>{t('step3Link')}</StoreButton>,
            },
            { title: t('step4Title'), body: t('step4Body') },
          ]}
        />
      </section>

      <section className={`${b.sec} ${b.g}`} aria-labelledby="lo-que-tienes">
        <div className={b.sh}>
          <h2 id="lo-que-tienes" className={b.disp}>
            {t('haveTitle1')}
            <br />
            {t('haveTitle2')}
          </h2>
        </div>
        <ul className={p.feats}>
          {[1, 2, 3, 4, 5].map((i) => (
            <li key={i}>
              <span className={`${b.mono} ${p.kicker}`}>{t(`f${i}k`)}</span>
              <h3>{t(`f${i}t`)}</h3>
              <p>{t(`f${i}b`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${b.sec} ${b.g}`} aria-label={t('tag')}>
        <ul className={p.strip}>
          {STRIP.map((s) => (
            <li key={s.img}>
              <figure>
                <Image src={photo(s.img)} alt={tr(`site.alt.${s.img}`)} fill sizes="(max-width: 640px) 50vw, 33vw" />
                <figcaption>{t(s.cap)}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
        <div className={p.centerCta}>
          <a className={b.cta} href={APP_STORE_URL} target="_blank" rel="noopener">
            App Store <ArrowRight />
          </a>
          <a className={b.cta} href={PLAY_STORE_URL} target="_blank" rel="noopener">
            Google Play <ArrowRight />
          </a>
        </div>
      </section>
    </>
  );
}
