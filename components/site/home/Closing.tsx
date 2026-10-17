import Image from 'next/image';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/site/links';
import { ArrowRight } from '../icons';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import b from '../base.module.css';
import StoreButton from '../StoreButton';
import s from './story.module.css';

/** "Tu grupo ya está entrenando.": the closing photo and the store links. */
export default function Closing({ lang }: { lang: SiteLanguage }) {
  const t = siteT(lang);
  return (
    <section className={s.close} aria-labelledby="cierre-titulo">
      <div className={s.closeIm}>
        <Image alt="" src="/site/close_team.jpg" fill sizes="100vw" />
      </div>
      <div className={`${s.over} ${b.g}`}>
        <h2 id="cierre-titulo" className={b.disp}>
          {t('site.home.closeTitle1')}
          <br />
          <em>{t('site.home.closeTitle2')}</em>
        </h2>
        <div className={`${b.acts} ${s.acts}`}>
          <StoreButton className={b.cta}>
            {t('site.nav.download')} <ArrowRight />
          </StoreButton>
          <a className={`${b.ulink} ${s.storeText}`} href={APP_STORE_URL} target="_blank" rel="noopener">
            App Store
          </a>
          <a className={`${b.ulink} ${s.storeText}`} href={PLAY_STORE_URL} target="_blank" rel="noopener">
            Google Play
          </a>
        </div>
      </div>
    </section>
  );
}
