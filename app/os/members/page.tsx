'use client';

/**
 * /os/members — temporary alias that redirects to /os/clients while
 * the new Members page is being built out. Once the new design lands,
 * delete this redirect and host the real page here.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MembersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/os/clients');
  }, [router]);
  return null;
}
