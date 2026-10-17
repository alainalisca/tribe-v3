import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import type { SiteSlug } from '@/lib/site/paths';
import b from './base.module.css';

/**
 * T-SITE1 Part A. A site page before Part E builds it: the page's kicker, its
 * one <h1> and one paragraph, so no link on the site lands on a 404. Copy is
 * under site.pages.<slug> in messages/{es,en}.json.
 */
export default function StubPage({ lang, slug }: { lang: SiteLanguage; slug: SiteSlug }) {
  const t = siteT(lang);
  return (
    <section className={`${b.sec} ${b.g} ${b.stub}`} aria-labelledby="pagina-titulo">
      <span className={`${b.mono} ${b.kick}`}>{t(`site.pages.${slug}.kicker`)}</span>
      <h1 id="pagina-titulo" className={b.disp}>
        {t(`site.pages.${slug}.title`)}
      </h1>
      <p>{t(`site.pages.${slug}.body`)}</p>
    </section>
  );
}
