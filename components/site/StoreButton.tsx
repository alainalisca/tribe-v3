'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { APP_STORE_URL, storeUrlFor } from '@/lib/site/links';

/** A link to this device's app store: Play on Android, App Store everywhere else. */
export default function StoreButton({ className, children }: { className?: string; children: ReactNode }) {
  const [href, setHref] = useState(APP_STORE_URL);
  useEffect(() => setHref(storeUrlFor(navigator.userAgent)), []);
  return (
    <a className={className} href={href} target="_blank" rel="noopener">
      {children}
    </a>
  );
}
