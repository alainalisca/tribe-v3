import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from '../icons';
import { T } from '../T';
import b from '../base.module.css';
import HeroPicture from './HeroPicture';
import h from './hero.module.css';

/** Inicio: the photo, "Nunca entrenes solo.", the lede, two actions and the partners line. */
export default function Hero() {
  return (
    <section className={h.hero} aria-labelledby="inicio-titulo">
      <div className={`${h.ph} ${b.grain}`}>
        <HeroPicture />
        <span className={`${h.credit} ${b.mono}`}>Zona de Combate · Ciudad del Río</span>
      </div>
      <div className={b.g}>
        <h1 id="inicio-titulo" className={`${b.disp} ${h.h1}`}>
          <span className={h.ln}>
            <i>
              <T k="site.home.h1a" />
            </i>
          </span>
          <span className={h.ln}>
            <i>
              <T k="site.home.h1b" />
            </i>
          </span>
          <span className={h.ln}>
            <i>
              <em>
                <T k="site.home.h1c" />
              </em>
            </i>
          </span>
        </h1>
        <div className={h.hrow}>
          <p>
            <b>
              <T k="site.home.ledeStrong" />
            </b>{' '}
            <T k="site.home.ledeRest" />
          </p>
          <div className={`${b.acts} ${h.acts}`}>
            <a className={b.cta} href="#semana">
              <T k="site.home.seeWeek" /> <ArrowRight />
            </a>
            <Link className={b.ulink} href="/coaches/">
              <T k="site.home.imCoach" />
            </Link>
          </div>
        </div>
        <div className={h.partners}>
          <span className={`${b.mono} ${h.label}`}>
            <T k="site.home.partnersLabel" />
          </span>
          <Image src="/site/bb_w.png" alt="BullBox" width={39} height={46} sizes="39px" />
          <Image src="/site/fv_w.png" alt="Fruta Vida" width={37} height={46} sizes="37px" />
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
