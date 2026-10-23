import Link from 'next/link';
import { coachPlansEnabled } from '@/lib/site/flags';
import { ArrowRight } from '../icons';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import Dotted from '../Dotted';
import b from '../base.module.css';
import s from './story.module.css';

/**
 * The lime band, and the About page's content (/about 301s to /#manifiesto).
 * Below it, the Part D plan hook ("¿Das clases? Arma tu grupo." with "Ver
 * planes" and "Tengo un gimnasio"), only while COACH_PLANS_ENABLED is on: with
 * it off the site shows no plan content (Al, 2026-10-17). Ink on lime
 * throughout (white on lime fails contrast).
 */
export default function Manifesto({ lang }: { lang: SiteLanguage }) {
  const t = siteT(lang);
  const plans = coachPlansEnabled();
  return (
    <section className={`${s.mani} ${b.g} ${b.grain}`} id="manifiesto" aria-labelledby="manifiesto-titulo">
      <h2 id="manifiesto-titulo" className={b.disp}>
        <span>
          <Dotted text={t('site.home.maniLine1')} />
        </span>
        <span>
          <Dotted text={t('site.home.maniLine2')} />
        </span>
      </h2>
      <div className={s.row2}>
        <p>{t('site.home.maniBody')}</p>
        <Link className={`${b.cta} ${b.ctaInk}`} href="/para-atletas/">
          {t('site.home.howItWorks')} <ArrowRight />
        </Link>
      </div>
      {plans && (
        <p className={s.hook}>
          <span>{t('site.home.hookLine')}</span>
          <Link className={`${b.ulink} ${b.ulinkInk}`} href="/planes/">
            {t('site.home.hookPlans')}
          </Link>
          <Link className={`${b.ulink} ${b.ulinkInk}`} href="/gimnasios/">
            {t('site.home.hookGym')}
          </Link>
        </p>
      )}
    </section>
  );
}
