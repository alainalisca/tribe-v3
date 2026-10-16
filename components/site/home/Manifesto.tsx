import Link from 'next/link';
import { coachPlansEnabled } from '@/lib/site/flags';
import { ArrowRight } from '../icons';
import { T } from '../T';
import b from '../base.module.css';
import s from './story.module.css';

/**
 * The lime band, and the About page's content (/about 301s to /#manifiesto).
 * Below it, the Part D plan hook: "Ver planes" when coach plans are on, else
 * "Soy coach". Ink on lime throughout (white on lime fails contrast).
 */
export default function Manifesto() {
  const plans = coachPlansEnabled();
  return (
    <section className={`${s.mani} ${b.g} ${b.grain}`} id="manifiesto" aria-labelledby="manifiesto-titulo">
      <h2 id="manifiesto-titulo" className={b.disp}>
        <span>
          <T k="site.home.maniLine1" />
        </span>
        <span>
          <T k="site.home.maniLine2" />
        </span>
      </h2>
      <div className={s.row2}>
        <p>
          <T k="site.home.maniBody" />
        </p>
        <Link className={`${b.cta} ${b.ctaInk}`} href="/para-atletas/">
          <T k="site.home.howItWorks" /> <ArrowRight />
        </Link>
      </div>
      <p className={s.hook}>
        <span>
          <T k="site.home.hookLine" />
        </span>
        <Link className={`${b.ulink} ${b.ulinkInk}`} href={plans ? '/planes/' : '/coaches/'}>
          <T k={plans ? 'site.home.hookPlans' : 'site.home.imCoach'} />
        </Link>
        <Link className={`${b.ulink} ${b.ulinkInk}`} href="/gimnasios/">
          <T k="site.home.hookGym" />
        </Link>
      </p>
    </section>
  );
}
