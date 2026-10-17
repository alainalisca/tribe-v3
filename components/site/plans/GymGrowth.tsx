import Image from 'next/image';
import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { faceProps, photo, type PhotoKey } from '@/lib/site/photos';
import { formatPlanPrice, mediaDayPaymentLink, sitePlanPrices } from '@/lib/site/plans';
import { talkToAlHref, WA_TOPICS } from '@/lib/site/whatsapp';
import { ArrowRight } from '../icons';
import b from '../base.module.css';
import p from './plans.module.css';

/** `cap`: the photo has a site.cap caption (T-SITE1.1 Part B). */
const DELIVERABLES: { key: string; img: PhotoKey; cap: boolean }[] = [
  { key: 'get1', img: 'gym_page', cap: true },
  { key: 'get2', img: 'gym_coaches', cap: true },
  { key: 'get3', img: 'gym_pass', cap: true },
  // Zona de Combate's sign on the cage padding (Al, 2026-10-17): al_zona is Aliados' photo.
  { key: 'get4', img: 'gym_report', cap: false },
];

/**
 * T-SITE1 Part D.3, Gimnasios: the four Tribe Crecimiento deliverables with
 * photos, then the price table (Página de gimnasio, Tribe Crecimiento, Media
 * Day). Rendered only while COACH_PLANS_ENABLED is on (the page checks).
 * "Aliados" comes with the full page in Part E.
 */
export default function GymGrowth({ lang }: { lang: SiteLanguage }) {
  const t = siteT(lang);
  const k = (key: string, vars?: Record<string, string | number>) => t(`site.plans.gym.${key}`, vars);
  const prices = sitePlanPrices();
  const mediaDayHref = mediaDayPaymentLink() ?? talkToAlHref('gimnasios', WA_TOPICS.mediaDay);
  return (
    <>
      <section className={`${b.sec} ${b.g}`} aria-labelledby="crecimiento-titulo">
        <span className={`${b.mono} ${b.kick}`}>{k('getKicker')}</span>
        <h2 id="crecimiento-titulo" className={`${b.disp} ${p.h2}`}>
          {k('getTitle')}
        </h2>
        <ul className={p.gets}>
          {DELIVERABLES.map((d) => (
            <li key={d.key}>
              <figure>
                <Image
                  alt={t(`site.alt.${d.img}`)}
                  src={photo(d.img)}
                  fill
                  sizes="(max-width: 860px) 50vw, 25vw"
                  {...faceProps(d.img)}
                />
                {d.cap && <span className={b.capTag}>{t(`site.cap.${d.img}`)}</span>}
              </figure>
              <h3>{k(d.key)}</h3>
            </li>
          ))}
        </ul>
      </section>
      <section className={`${p.paper} ${b.g}`} aria-labelledby="precios-titulo">
        <span className={`${b.mono} ${p.kick}`}>{k('priceKicker')}</span>
        <h2 id="precios-titulo" className={b.disp}>
          {k('priceTitle')}
        </h2>
        <div className={p.three}>
          <div className={p.plan}>
            <h3>{k('pageName')}</h3>
            <p className={p.price}>{k('pagePrice')}</p>
            <a className={`${b.ulink} ${b.ulinkInk}`} href={talkToAlHref('gimnasios', WA_TOPICS.partner)}>
              {k('pageCta')}
            </a>
          </div>
          <div className={`${p.plan} ${p.featured}`}>
            <h3>{k('growName')}</h3>
            <p className={p.price}>{k('growPrice', { price: formatPlanPrice(prices.crecimiento, lang) })}</p>
            <div className={p.acts}>
              <Link className={`${b.cta} ${b.ctaInk}`} href="/planes/">
                {k('growCta')} <ArrowRight />
              </Link>
              <a className={`${b.ulink} ${b.ulinkInk}`} href={talkToAlHref('gimnasios', WA_TOPICS.growth)}>
                {k('growTalk')}
              </a>
            </div>
          </div>
          <div className={p.plan}>
            <h3>{k('mediaName')}</h3>
            <p className={p.price}>{k('mediaPrice', { price: formatPlanPrice(prices.mediaDay, lang) })}</p>
            <a className={`${b.ulink} ${b.ulinkInk}`} href={mediaDayHref}>
              {k('mediaCta')}
            </a>
          </div>
        </div>
        <p className={p.money}>{k('money')}</p>
      </section>
    </>
  );
}
