/**
 * The viewer's OWN participation on a session: joined (confirmed) or pending.
 *
 * Read from the viewer's own session_participants row (checkExistingParticipation,
 * allowed by sp_select_own), NOT from the roster. The roster the page loads is
 * confirmed-only twice over: fetchSessionWithDetails filters status='confirmed',
 * and session_participants_roster does not return pending rows to a non-host.
 * Deriving isPending from it meant a pending request could never be seen, so an
 * athlete who had just requested a paid or curated session got "Solicitar
 * unirse" back, no awaiting-payment state, no payment instructions and no pay
 * sheet (found on the T-PAY2 local stack, 2026-10-12; on main since 2026-03-05).
 *
 * If the own-row read fails, fall back to the roster, which can still tell a
 * confirmed participant apart, and report the source so the caller can log it.
 */

import type { DalResult } from '@/lib/dal/types';

export interface ViewerParticipation {
  hasJoined: boolean;
  isPending: boolean;
  source: 'own-row' | 'roster-fallback';
}

export function resolveViewerParticipation({
  ownRow,
  roster,
  userId,
}: {
  ownRow: DalResult<{ status: string | null } | null>;
  roster: { user_id: string | null; status: string | null }[];
  userId: string;
}): ViewerParticipation {
  if (ownRow.success) {
    const status = ownRow.data?.status ?? null;
    return { hasJoined: status === 'confirmed', isPending: status === 'pending', source: 'own-row' };
  }
  const fromRoster = roster.find((p) => p.user_id === userId);
  return {
    hasJoined: !!fromRoster && fromRoster.status === 'confirmed',
    isPending: !!fromRoster && fromRoster.status === 'pending',
    source: 'roster-fallback',
  };
}
