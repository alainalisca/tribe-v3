import Image from 'next/image';
import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { APP_STORE_URL, CONTACT_EMAIL, PLAY_STORE_URL } from '@/lib/site/links';
import { photo } from '@/lib/site/photos';
import LanguageToggle from './LanguageToggle';
import b from './base.module.css';
import c from './chrome.module.css';

type FooterLink = { k: string; href: string; external?: boolean };

export default function SiteFooter({ lang, plansEnabled }: { lang: SiteLanguage; plansEnabled: boolean }) {
  const t = siteT(lang);
  const product: FooterLink[] = [
    { k: 'athletes', href: '/para-atletas/' },
    { k: 'coaches', href: '/coaches/' },
    { k: 'gyms', href: '/gimnasios/' },
    ...(plansEnabled ? [{ k: 'plans', href: '/planes/' }] : []),
    { k: 'tv', href: '/tv/' },
  ];
  const company: FooterLink[] = [
    { k: 'faq', href: '/preguntas/' },
    { k: 'contact', href: `mailto:${CONTACT_EMAIL}`, external: true },
    { k: 'terms', href: '/legal/terms/' },
    { k: 'privacy', href: '/legal/privacy/' },
    { k: 'dataPolicy', href: '/legal/tratamiento-de-datos/' },
  ];

  const column = (titleKey: string, links: FooterLink[]) => (
    <div>
      <h3>{t(`site.footer.${titleKey}`)}</h3>
      <ul>
        {links.map((l) => (
          <li key={l.k}>
            {l.external ? (
              <a href={l.href}>{t(`site.footer.${l.k}`)}</a>
            ) : (
              <Link href={l.href}>{t(`site.footer.${l.k}`)}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <footer className={c.footer}>
      <div className={b.g}>
        <div className={c.fTop}>
          <div className={c.fBrand}>
            <Image className={c.logo} src={photo('logo_w')} alt="Tribe" width={85} height={28} sizes="85px" />
            <p>{t('site.footer.tagline')}</p>
          </div>
          <nav className={c.fCols} aria-label={t('site.footer.navAria')}>
            {column('product', product)}
            {column('company', company)}
          </nav>
        </div>
        <div className={c.fBottom}>
          <div className={c.stores}>
            <a className={b.ulink} href={APP_STORE_URL} target="_blank" rel="noopener">
              App Store
            </a>
            <a className={b.ulink} href={PLAY_STORE_URL} target="_blank" rel="noopener">
              Google Play
            </a>
          </div>
          <LanguageToggle current={lang} />
          <span>© 2026 A Plus Fitness LLC</span>
        </div>
        <Image
          className={c.giant}
          src={photo('logo_w')}
          alt=""
          aria-hidden="true"
          width={1709}
          height={564}
          sizes="100vw"
        />
      </div>
    </footer>
  );
}
