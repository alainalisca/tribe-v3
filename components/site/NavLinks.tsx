'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SITE_PAGES } from '@/lib/site/links';
import { useSiteT } from '@/lib/site/useSiteT';
import c from './chrome.module.css';

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/inicio');
  return pathname === href || pathname === href.slice(0, -1) || pathname.startsWith(href);
}

/** Desktop link row, or (`variant="sub"`) the phone's scrolling row with Inicio first. */
export default function NavLinks({ variant }: { variant: 'main' | 'sub' }) {
  const t = useSiteT('site.nav');
  const pathname = usePathname() ?? '/';
  const pages = variant === 'sub' ? [{ key: 'home', href: '/' } as const, ...SITE_PAGES] : SITE_PAGES;

  const items = pages.map((p) => {
    const on = isCurrent(pathname, p.href);
    return (
      <Link key={p.key} href={p.href} className={on ? c.on : undefined} aria-current={on ? 'page' : undefined}>
        {t(p.key)}
      </Link>
    );
  });

  if (variant === 'sub') return <div className={`${c.subIn}`}>{items}</div>;
  return (
    <ul className={c.links}>
      {items.map((item) => (
        <li key={item.key}>{item}</li>
      ))}
    </ul>
  );
}
