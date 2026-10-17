'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import c from './chrome.module.css';

/** One nav link, its label already translated on the server. */
export type NavItem = { href: string; label: string };

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname === href.slice(0, -1) || pathname.startsWith(href);
}

/**
 * Desktop link row, or (`variant="sub"`) the phone's scrolling row with Inicio
 * first. Client only to underline the current page.
 */
export default function NavLinks({ variant, items }: { variant: 'main' | 'sub'; items: NavItem[] }) {
  const pathname = usePathname() ?? '/';
  const links = items.map((p) => {
    const on = isCurrent(pathname, p.href);
    return (
      <Link key={p.href} href={p.href} className={on ? c.on : undefined} aria-current={on ? 'page' : undefined}>
        {p.label}
      </Link>
    );
  });

  if (variant === 'sub') return <div className={c.subIn}>{links}</div>;
  return (
    <ul className={c.links}>
      {links.map((link) => (
        <li key={link.key}>{link}</li>
      ))}
    </ul>
  );
}
