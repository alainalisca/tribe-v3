import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from '../icons';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { photo } from '@/lib/site/photos';
import b from '../base.module.css';
import HeroPicture from './HeroPicture';
import h from './hero.module.css';

/** Inicio: the photo, "Nunca entrenes solo.", the lede, two actions and the partners line. */
export default function Hero({ lang }: { lang: SiteLanguage }) {
  const t = siteT(lang);
  return (
    <section className={h.hero} aria-labelledby="inicio-titulo">
      <div className={`${h.ph} ${b.grain}`}>
        <HeroPicture alt={t('site.alt.hero_full')} />
        <span className={`${h.credit} ${b.mono}`}>Zona de Combate · Ciudad del Río</span>
      </div>
      <div className={b.g}>
        <h1 id="inicio-titulo" className={`${b.disp} ${h.h1}`}>
          <span className={h.ln}>
            <i>{t('site.home.h1a')}</i>
          </span>
          <span className={h.ln}>
            <i>{t('site.home.h1b')}</i>
          </span>
          <span className={h.ln}>
            <i>
              <em>{t('site.home.h1c')}</em>
            </i>
          </span>
        </h1>
        <div className={h.hrow}>
          <p>
            <b>{t('site.home.ledeStrong')}</b> {t('site.home.ledeRest')}
          </p>
          <div className={`${b.acts} ${h.acts}`}>
            <a className={b.cta} href="#semana">
              {t('site.home.seeWeek')} <ArrowRight />
            </a>
            <Link className={b.ulink} href="/coaches/">
              {t('site.home.imCoach')}
            </Link>
          </div>
        </div>
        <div className={h.partners}>
          <span className={`${b.mono} ${h.label}`}>{t('site.home.partnersLabel')}</span>
          <Image src={photo('bb_w')} alt="BullBox" width={39} height={46} sizes="39px" />
          <Image src={photo('fv_w')} alt="Fruta Vida" width={37} height={46} sizes="37px" />
          <span className={h.zona}>
            Zona de
            <br />
            Combate
          </span>
        </div>
      </div>
    </section>
  );
}
