'use client';

/**
 * /os/settings — Tribe.OS settings hub. Until a full settings UI
 * lands this page redirects to /os/gym, which holds the editable
 * gym settings (name, slug, timezone, default currency). The full
 * Settings page will eventually consolidate gym + account +
 * coach/access + integrations under tabs.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/os/gym');
  }, [router]);
  return null;
}
