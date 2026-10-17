import Image from 'next/image';
import Link from 'next/link';
import { coachPlansEnabled } from '@/lib/site/flags';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { faceProps, photo } from '@/lib/site/photos';
import { talkToAlHref, WA_TOPICS } from '@/lib/site/whatsapp';
import GymGrowth from '../plans/GymGrowth';
import { ArrowRight } from '../icons';
import b from '../base.module.css';
import PageHero from './PageHero';
import p from './pages.module.css';

/**
 * Page: /gimnasios/ (T-SITE1 Part E, mock "Gimnasios" + Part D).
 *
 * Flag OFF: hero with "Aplica como aliado" (the WhatsApp sales line, which is
 * not plan content), the mock's six "Qué recibes", Aliados. Flag ON (COACH_PLANS_ENABLED): "Hablar con Al" is the primary
 * action, and "Qué recibes" becomes the four Tribe Crecimiento deliverables
 * plus the price table, whose free column keeps "Aplica como aliado".
 */
export default function GymsContent({ lang }: { lang: SiteLanguage }) {
  const tr = siteT(lang);
  const t = (k: string) => tr(`site.gyms.${k}`);
  const plans = coachPlansEnabled();
  const ALLIES = [
    { key: 'bb', name: 'BullBox', img: 'al_bb', logo: false },
    { key: 'zona', name: 'Zona de Combate', img: 'al_zona', logo: false },
    { key: 'fv', name: 'Fruta Vida', img: 'fv_w', logo: true },
  ] as const;

  return (
    <>
      <PageHero
        img="hero_gym"
        alt={tr('site.alt.hero_gym')}
        tag={t('tag')}
        title1={t('title1')}
        title2={t('title2')}
        ledeStrong={t('ledeStrong')}
        ledeRest={t('ledeRest')}
      >
        {plans ? (
          <a className={b.cta} href={talkToAlHref('gimnasios')}>
            {t('talk')} <ArrowRight />
          </a>
        ) : (
          <a className={b.cta} href={talkToAlHref('gimnasios', WA_TOPICS.partner)}>
            {t('apply')} <ArrowRight />
          </a>
        )}
      </PageHero>

      {plans ? (
        <GymGrowth lang={lang} />
      ) : (
        <section className={`${b.sec} ${b.g}`} aria-labelledby="que-recibes">
          <div className={b.sh}>
            <h2 id="que-recibes" className={b.disp}>
              {t('getTitle')}
            </h2>
            <p>{t('getLede')}</p>
          </div>
          <ul className={p.feats}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <li key={i}>
                <span className={`${b.mono} ${p.kicker}`}>{t(`f${i}k`)}</span>
                <h3 className={i === 6 ? p.muted : undefined}>{t(`f${i}t`)}</h3>
                <p>
                  {t(`f${i}b`)}
                  {i === 6 && (
                    <>
                      {' '}
                      <Link className={b.ulink} href="/tribe-os/">
                        {t('f6link')}
                      </Link>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${b.sec} ${b.g}`} aria-labelledby="aliados">
        <div className={b.sh}>
          <h2 id="aliados" className={b.disp}>
            {t('alliesTitle')}
          </h2>
          <p>{t('alliesLede')}</p>
        </div>
        <ul className={p.allies}>
          {ALLIES.map((a) => (
            <li key={a.key}>
              <figure className={`${p.allyIm} ${a.logo ? p.allyLogo : ''}`}>
                <Image
                  src={photo(a.img)}
                  alt={a.logo ? a.name : tr(`site.alt.${a.img}`)}
                  fill
                  sizes="(max-width: 860px) 120px, 33vw"
                  {...faceProps(a.img)}
                />
              </figure>
              <h3>{a.name}</h3>
              <span className={`${b.mono} ${p.muted}`}>{t(`${a.key}Kind`)}</span>
              <p>{t(`${a.key}Body`)}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
