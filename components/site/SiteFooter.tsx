import Image from 'next/image';
import Link from 'next/link';
import { APP_STORE_URL, CONTACT_EMAIL, PLAY_STORE_URL } from '@/lib/site/links';
import LanguageToggle from './LanguageToggle';
import { T } from './T';
import b from './base.module.css';
import c from './chrome.module.css';

type FooterLink = { k: string; href: string; external?: boolean };

export default function SiteFooter({ plansEnabled }: { plansEnabled: boolean }) {
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
      <h3>
        <T k={`site.footer.${titleKey}`} />
      </h3>
      <ul>
        {links.map((l) => (
          <li key={l.k}>
            {l.external ? (
              <a href={l.href}>
                <T k={`site.footer.${l.k}`} />
              </a>
            ) : (
              <Link href={l.href}>
                <T k={`site.footer.${l.k}`} />
              </Link>
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
            <Image className={c.logo} src="/tribe-wordmark.png" alt="Tribe" width={85} height={28} sizes="85px" />
            <p>
              <T k="site.footer.tagline" />
            </p>
          </div>
          <nav className={c.fCols} aria-label="Footer">
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
          <LanguageToggle />
          <span>© 2026 A Plus Fitness LLC</span>
        </div>
        <Image
          className={c.giant}
          src="/tribe-wordmark.png"
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
