import Image from 'next/image';
import Link from 'next/link';
import NavActions from './NavActions';
import NavLinks from './NavLinks';
import b from './base.module.css';
import c from './chrome.module.css';

/**
 * Sticky, always-solid header: the audit found the old one transparent over the
 * page. 64px bar; under 860px the links move to a scrolling row with Inicio.
 */
export default function SiteNav() {
  return (
    <header className={c.nav}>
      <div className={`${b.g} ${c.bar}`}>
        <Link href="/" aria-label="Tribe, inicio">
          <Image className={c.logo} src="/tribe-wordmark.png" alt="Tribe" width={85} height={28} sizes="85px" />
        </Link>
        <nav aria-label="Principal">
          <NavLinks variant="main" />
        </nav>
        <NavActions />
      </div>
      <nav className={c.subnav} aria-label="Secciones">
        <div className={b.g}>
          <NavLinks variant="sub" />
        </div>
      </nav>
    </header>
  );
}
