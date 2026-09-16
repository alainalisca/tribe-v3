/**
 * One definition of "who counts as an athlete on a session", shared by every
 * surface that renders or counts a roster.
 *
 * THE CONVENTION (settled 2026-09-16): the host does NOT occupy a capacity
 * seat, and every count refers to athletes only. When an instructor says
 * "10 spots" they mean 10 students. `sessions.creator_id` already represents
 * the host, so a `session_participants` row for the host is a second source of
 * truth for the same fact -- and on a full session it costs a real athlete a
 * seat.
 *
 * WHY THIS IS A SHARED MODULE RATHER THAN A FILTER IN EACH COMPONENT.
 * Before this existed the two surfaces that show the same number disagreed by
 * one on ALL 363 live sessions:
 *
 *   - SessionCard:     `confirmedParticipants.length` / max   (no host added)
 *   - ParticipantList: `participants.length + 1`              (host added)
 *
 * so a session with three athletes read "3/10" on the feed card and
 * "Atletas (4)" on its own detail page. Neither surface was reading a
 * different roster; they were applying different arithmetic to the same one.
 * Putting the rule in one place is what makes that disagreement expressible
 * only by editing this file. components/rosterCountParity.test.tsx asserts the
 * two rendered numbers are equal AND correct, so re-adding a `+ 1` to either
 * surface fails, and dropping the host filter from both (which would keep them
 * agreeing) fails too.
 *
 * GUESTS COUNT. A guest row has `user_id = NULL` and can never match a
 * creator_id, so guests fall through this filter untouched and keep their
 * seat -- they are attendees, they just have no profile.
 *
 * SEPARATELY: 23 live sessions still carry a real host row in
 * session_participants (all of them from before 2026-03-15, all with zero
 * other athletes). Those rows still consume a seat via
 * sessions.current_participants, which is maintained by
 * trg_sync_session_participant_count (migration 087) counting confirmed rows
 * in the DATABASE and is not affected by this filter. Deleting them is the
 * destructive half of T-ATH7 and lands separately; the trigger recomputes
 * current_participants on the delete, so the counter corrects itself then.
 */

/** The shape every roster row shares, whatever else the caller carries. */
export interface RosterRowLike {
  user_id: string | null;
}

/** A roster row that still carries its join status. */
export interface StatusedRosterRowLike extends RosterRowLike {
  status: string | null;
}

/** The only status that occupies a seat. A pending request is not an attendee. */
export const SEAT_STATUS = 'confirmed';

/**
 * True when this row is the session host's own participant row.
 *
 * Anchored on the creator_id foreign key rather than on a `role` or a name,
 * because that key is the only authoritative statement of who hosts the
 * session. A null user_id (a guest) is never the host.
 */
export function isHostParticipantRow(row: RosterRowLike, creatorId: string | null | undefined): boolean {
  return !!creatorId && !!row.user_id && row.user_id === creatorId;
}

/**
 * The athletes on a session: every roster row except the host's own.
 *
 * Callers pass whatever row type they already have; the return keeps it, so
 * this can drop into an existing render without widening any type.
 */
export function athleteParticipants<T extends RosterRowLike>(
  participants: readonly T[] | null | undefined,
  creatorId: string | null | undefined
): T[] {
  return (participants ?? []).filter((p) => !isHostParticipantRow(p, creatorId));
}

/**
 * The seat-holding athletes on a session: confirmed, and not the host.
 *
 * This is the function both counting surfaces call, and it exists because
 * filtering in the callers was not enough. SessionCard filtered
 * `status === 'confirmed'` and ParticipantList did not -- invisible in
 * production only because fetchSessionWithDetails already filters status at the
 * database, so the detail page happened to receive pre-filtered rows. Handed
 * the same unfiltered roster the two components still disagreed, which is the
 * defect this ticket is about. With one function the surfaces cannot diverge
 * without editing it.
 */
export function athleteRoster<T extends StatusedRosterRowLike>(
  participants: readonly T[] | null | undefined,
  creatorId: string | null | undefined
): T[] {
  return athleteParticipants(
    (participants ?? []).filter((p) => p.status === SEAT_STATUS),
    creatorId
  );
}
