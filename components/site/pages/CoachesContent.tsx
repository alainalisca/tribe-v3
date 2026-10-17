import Image from 'next/image';
import Link from 'next/link';
import { coachPlansEnabled } from '@/lib/site/flags';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { faceProps, photo } from '@/lib/site/photos';
import CoachPlans from '../plans/CoachPlans';
import { ArrowRight } from '../icons';
import StoreButton from '../StoreButton';
import b from '../base.module.css';
import Faq from './Faq';
import PageHero from './PageHero';
import Steps from './Steps';
import p from './pages.module.css';

const OFFERS = [
  { key: 'A', status: 'available' },
  { key: 'B', status: 'available' },
  { key: 'C', status: 'available' },
  { key: 'D', status: 'available' },
  { key: 'E', status: 'byInvite' },
  { key: 'F', status: 'soon', href: '/tribe-os/' },
] as const;

/**
 * Page: /coaches/ (T-SITE1 Part E, mock "Coaches" + Part D). Hero, how it
 * works, what you can offer, then "Dos maneras" (Básico and Coach Pro) only
 * while COACH_PLANS_ENABLED is on, then three questions. The money story is
 * stated once, in step 4.
 */
export default function CoachesContent({ lang }: { lang: SiteLanguage }) {
  const tr = siteT(lang);
  const t = (k: string) => tr(`site.coaches.${k}`);
  return (
    <>
      <PageHero
        img="hero_coach"
        alt={tr('site.alt.hero_coach')}
        tag={t('tag')}
        title1={t('title1')}
        title2={t('title2')}
        ledeStrong={t('ledeStrong')}
      >
        <StoreButton className={b.cta}>
          {t('start')} <ArrowRight />
        </StoreButton>
        <Link className={b.ulink} href="/tribe-os/">
          {t('seeOs')}
        </Link>
      </PageHero>

      <section className={`${b.sec} ${b.g}`} aria-labelledby="como-funciona">
        <div className={b.sh}>
          <h2 id="como-funciona" className={b.disp}>
            {t('howTitle')}
          </h2>
          <p>{t('howLede')}</p>
        </div>
        <Steps steps={[1, 2, 3, 4].map((i) => ({ title: t(`step${i}Title`), body: t(`step${i}Body`) }))} />
        <figure className={`${p.photo} ${p.photoWide}`}>
          <Image
            src={photo('coach_group')}
            alt={tr('site.alt.coach_group')}
            fill
            sizes="(max-width: 1440px) 100vw, 1340px"
            {...faceProps('coach_group')}
          />
          <figcaption className={b.capTag}>{tr('site.cap.coach_group')}</figcaption>
        </figure>
      </section>

      <section className={`${b.sec} ${b.g}`} aria-labelledby="que-ofrecer">
        <div className={b.sh}>
          <h2 id="que-ofrecer" className={b.disp}>
            {t('offerTitle1')}
            <br />
            {t('offerTitle2')}
          </h2>
          <p>{t('offerLede')}</p>
        </div>
        <ul className={p.olist}>
          {OFFERS.map((o) => {
            const inner = (
              <>
                <span className={p.oLetter} aria-hidden="true">
                  {o.key}
                </span>
                <h3>{t(`offer${o.key}`)}</h3>
                <p>{t(`offer${o.key}Body`)}</p>
                <span className={`${p.oTag} ${o.status === 'soon' ? p.oSoon : ''}`}>{t(o.status)}</span>
              </>
            );
            return (
              <li key={o.key}>
                {'href' in o ? (
                  <Link className={p.o} href={o.href}>
                    {inner}
                  </Link>
                ) : (
                  <div className={p.o}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {coachPlansEnabled() && <CoachPlans lang={lang} />}

      <section className={`${b.sec} ${b.g}`} aria-labelledby="preguntas-coaches">
        <div className={b.sh}>
          <h2 id="preguntas-coaches" className={b.disp}>
            {t('faqTitle')}
          </h2>
          <Link className={b.ulink} href="/preguntas/">
            {t('allFaq')}
          </Link>
        </div>
        <Faq items={[1, 2, 3].map((i) => ({ q: t(`q${i}`), a: t(`a${i}`) }))} />
      </section>
    </>
  );
}
