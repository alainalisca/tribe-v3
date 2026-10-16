import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/site/links';
import { ArrowRight } from '../icons';
import { SiteImage, T } from '../T';
import b from '../base.module.css';
import StoreButton from '../StoreButton';
import s from './story.module.css';

/** "Tu grupo ya está entrenando.": the closing photo and the store links. */
export default function Closing() {
  return (
    <section className={s.close} aria-labelledby="cierre-titulo">
      <div className={s.closeIm}>
        <SiteImage altKey={null} src="/site/close_team.jpg" fill sizes="100vw" />
      </div>
      <div className={`${s.over} ${b.g}`}>
        <h2 id="cierre-titulo" className={b.disp}>
          <T k="site.home.closeTitle1" />
          <br />
          <em>
            <T k="site.home.closeTitle2" />
          </em>
        </h2>
        <div className={`${b.acts} ${s.acts}`}>
          <StoreButton className={b.cta}>
            <T k="site.nav.download" /> <ArrowRight />
          </StoreButton>
          <a className={b.ulink} href={APP_STORE_URL} target="_blank" rel="noopener">
            App Store
          </a>
          <a className={b.ulink} href={PLAY_STORE_URL} target="_blank" rel="noopener">
            Google Play
          </a>
        </div>
      </div>
    </section>
  );
}
