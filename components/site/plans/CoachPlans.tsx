import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { formatPlanPrice, sitePlanPrices } from '@/lib/site/plans';
import { ArrowRight } from '../icons';
import b from '../base.module.css';
import p from './plans.module.css';

/**
 * T-SITE1 Part D.2, Coaches: "Dos maneras", Básico (free) and Coach Pro.
 * Rendered only while COACH_PLANS_ENABLED is on (the page checks); there is no
 * flag-off version, so with the flag off the page shows no plan at all.
 */
export default function CoachPlans({ lang }: { lang: SiteLanguage }) {
  const t = siteT(lang);
  const { pro } = sitePlanPrices();
  const k = (key: string, vars?: Record<string, string | number>) => t(`site.plans.coach.${key}`, vars);
  return (
    <section className={`${p.paper} ${b.g}`} aria-labelledby="planes-coach-titulo">
      <span className={`${b.mono} ${p.kick}`}>{k('kicker')}</span>
      <h2 id="planes-coach-titulo" className={b.disp}>
        {k('title')}
      </h2>
      <div className={p.two}>
        <div className={p.plan}>
          <h3>{k('basicName')}</h3>
          <p className={p.price}>{k('basicPrice')}</p>
          <ul>
            {[1, 2, 3, 4].map((i) => (
              <li key={i}>{k(`basic${i}`)}</li>
            ))}
          </ul>
          <Link className={`${b.cta} ${b.ctaInk}`} href="/auth/">
            {k('basicCta')} <ArrowRight />
          </Link>
        </div>
        <div className={`${p.plan} ${p.featured}`}>
          <h3>{k('proName')}</h3>
          <p className={p.price}>
            {k('proPrice', { price: formatPlanPrice(pro, lang) })}
            <span className={`${b.mono} ${p.note}`}>{k('proNote')}</span>
          </p>
          <ul>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <li key={i}>{k(`pro${i}`)}</li>
            ))}
          </ul>
          <Link className={`${b.cta} ${b.ctaInk}`} href="/planes/">
            {k('proCta')} <ArrowRight />
          </Link>
        </div>
      </div>
      <p className={p.money}>{k('money')}</p>
    </section>
  );
}
