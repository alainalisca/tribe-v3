'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';

/**
 * T-MOM1: "¿Ya pasó? Registrar sesión pasada" on the create screen. Shown
 * only when the server says Moments is on and this user may register one
 * (an instructor or an admin); nothing renders otherwise.
 */
export default function PastSessionLink() {
  const t = useTranslations('moments');
  const [show, setShow] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/moments/status/')
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (b: { enabled?: boolean; canRegisterPast?: boolean } | null) =>
          !cancelled && setShow(!!(b?.enabled && b.canRegisterPast))
      )
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  if (!show) return null;
  return (
    <Link
      href="/fotos/registrar-sesion/"
      className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-900 dark:border-tribe-mid dark:bg-tribe-card dark:text-white"
    >
      <History className="h-4 w-4 text-stone-500" />
      {t('pastLink')}
    </Link>
  );
}
