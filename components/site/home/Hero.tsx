import Image from 'next/image';
import Link from 'next/link';
import Dotted from '../Dotted';
import { ArrowRight } from '../icons';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { backgroundBoxStyle, photo } from '@/lib/site/photos';
import b from '../base.module.css';
import HeroPicture from './HeroPicture';
import h from './hero.module.css';

/** Inicio: the photo, "Nunca entrenes solo.", the lede, two actions and the partners line. */
export default function Hero({ lang }: { lang: SiteLanguage }) {
  const t = siteT(lang);
  return (
    <section className={h.hero} aria-labelledby="inicio-titulo">
      <div className={`${h.ph} ${b.grain}`} style={backgroundBoxStyle('hero_full')}>
        <HeroPicture alt={t('site.alt.hero_full')} />
        <span className={`${h.credit} ${b.mono}`}>Zona de Combate · Ciudad del Río</span>
      </div>
      <div className={b.g}>
        {/* Site polish (Al, 2026-10-23): one line on desktop, two on phones
            ("Nunca entrenes" / "solo."), sized to the width (hero.module.css). */}
        <h1 id="inicio-titulo" className={`${b.disp} ${h.h1} ${lang === 'es' ? h.es : h.en}`}>
          <span className={h.ln}>
            <i>{t('site.home.h1a')}</i>
          </span>{' '}
          <span className={h.ln}>
            <i>{t('site.home.h1b')}</i>
          </span>{' '}
          <span className={h.ln}>
            <i>
              <em>
                <Dotted text={t('site.home.h1c')} />
              </em>
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
        {/* "Aliados": gyms that train on Tribe, then partner brands, centered;
            on phones the groups wrap into centered rows. Zona de Combate has no
            logo file, so it is set as a wordmark at the marks' cap height. */}
        <div className={h.partners}>
          <span className={`${b.mono} ${h.label}`}>{t('site.home.partnersLabel')}</span>
          <div className={h.marks}>
            <div className={h.pgroup} role="group" aria-labelledby="aliados-entrenan">
              <span id="aliados-entrenan" className={`${b.mono} ${h.glabel}`}>
                {t('site.home.partnersTrain')}
              </span>
              <Image src={photo('bb_w')} alt="BullBox" width={39} height={46} sizes="39px" />
              <span className={h.zona}>Zona de Combate</span>
            </div>
            <div className={h.pgroup} role="group" aria-labelledby="aliados-marcas">
              <span id="aliados-marcas" className={`${b.mono} ${h.glabel}`}>
                {t('site.home.partnersBrands')}
              </span>
              <Image src={photo('fv_w')} alt="Fruta Vida" width={37} height={46} sizes="37px" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
