'use client';

/**
 * /os/clients — redirects to /os/members.
 *
 * The old dark-theme clients list lived here. The new light-theme
 * Members surface is at /os/members. Existing bookmarks land here
 * and bounce forward. Child routes /os/clients/[id], /new,
 * /[id]/edit still work directly (they're more specific routes).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/os/members');
  }, [router]);
  return null;
}
