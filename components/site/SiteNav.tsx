import Image from 'next/image';
import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { SITE_PAGES } from '@/lib/site/links';
import { photo } from '@/lib/site/photos';
import NavActions from './NavActions';
import NavLinks, { type NavItem } from './NavLinks';
import b from './base.module.css';
import c from './chrome.module.css';

/**
 * Sticky, always-solid header: the audit found the old one transparent over the
 * page. 64px bar; under 860px the links move to a scrolling row with Inicio.
 * Labels are looked up here, on the server; the client pieces only mark the
 * current page and swap in the avatar.
 */
export default function SiteNav({
  lang,
  hideDownloadWhenSignedIn = false,
}: {
  lang: SiteLanguage;
  hideDownloadWhenSignedIn?: boolean;
}) {
  const t = siteT(lang);
  const pages: NavItem[] = SITE_PAGES.map((p) => ({ href: p.href, label: t(`site.nav.${p.key}`) }));
  const home: NavItem = { href: '/', label: t('site.nav.home') };
  return (
    <header className={c.nav}>
      <div className={`${b.g} ${c.bar}`}>
        <Link href="/" aria-label={t('site.nav.homeAria')}>
          <Image className={c.logo} src={photo('logo_w')} alt="Tribe" width={85} height={28} sizes="85px" />
        </Link>
        <nav aria-label={t('site.nav.mainAria')}>
          <NavLinks variant="main" items={pages} />
        </nav>
        <NavActions
          signIn={t('site.nav.signIn')}
          download={t('site.nav.download')}
          myFeed={t('site.nav.myFeed')}
          hideDownloadWhenSignedIn={hideDownloadWhenSignedIn}
        />
      </div>
      <nav className={c.subnav} aria-label={t('site.nav.subAria')}>
        <div className={b.g}>
          <NavLinks variant="sub" items={[home, ...pages]} />
        </div>
      </nav>
    </header>
  );
}
