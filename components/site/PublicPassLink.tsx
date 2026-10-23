'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import { publicPassHref } from '@/lib/site/publicProfile';

/**
 * T-POLISH1 PR 3b-1: "Primera clase gratis" on the public gym (/g) and coach
 * (/i) pages. The server renders the plain /pase/<slug>/ link; once in the
 * browser it carries this page's own attribution tags along, so a visitor who
 * came from a printed QR claims the pass with that QR's src and code
 * (lib/site/publicProfile publicPassHref).
 */
export default function PublicPassLink({
  slug,
  label,
  sub,
  surface,
  className,
  subClassName,
}: {
  slug: string;
  label: string;
  sub: string;
  surface: 'gym_page' | 'coach_page';
  className: string;
  subClassName: string;
}) {
  const [href, setHref] = useState(() => publicPassHref(slug, ''));
  useEffect(() => {
    setHref(publicPassHref(slug, window.location.search));
  }, [slug]);
  return (
    <div data-testid="public-pass">
      <Link href={href} className={className} onClick={() => trackEvent('pass_entry_tapped', { surface })}>
        <Ticket className="w-4 h-4" aria-hidden="true" />
        {label}
      </Link>
      <p className={subClassName}>{sub}</p>
    </div>
  );
}
