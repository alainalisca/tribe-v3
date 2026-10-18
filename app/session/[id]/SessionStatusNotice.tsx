'use client';

import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { hostFirstName } from '@/lib/share/sessionPublic';

/**
 * T-JOIN1b: the line at the top of a session that is not an ordinary one.
 *
 *   testHost   "Sesión de prueba, solo tú la ves" (the host of a test session)
 *   testAdmin  the same for an admin looking at someone else's test session
 *   cancelled  "Esta sesión fue cancelada", and a link to the host's coach page
 */
export default function SessionStatusNotice({
  kind,
  hostId,
  hostName,
}: {
  kind: 'testHost' | 'testAdmin' | 'cancelled';
  hostId?: string | null;
  hostName?: string | null;
}) {
  const tTest = useTranslations('sessionTest');
  const tPublic = useTranslations('sessionPublic');
  if (kind === 'cancelled') {
    const first = hostFirstName(hostName);
    return (
      <div role="status" className="rounded-xl border border-stone-300 dark:border-gray-600 bg-theme-card p-4">
        <p className="font-semibold text-theme-primary">{tPublic('cancelledNotice')}</p>
        {hostId && (
          <Link href={`/i/${hostId}/`} className="mt-1 inline-block text-sm text-theme-secondary underline">
            {tPublic('coachLink', { name: first || tPublic('coachFallback') })}
          </Link>
        )}
      </div>
    );
  }
  return (
    <p
      role="status"
      className="rounded-xl bg-amber-100 dark:bg-amber-900/30 px-4 py-2 text-sm font-semibold text-amber-900 dark:text-amber-200"
    >
      {tTest(kind === 'testHost' ? 'noteHost' : 'noteAdmin')}
    </p>
  );
}
