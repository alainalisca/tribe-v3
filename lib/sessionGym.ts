/**
 * Which gym, if any, a session card should show -- and in which role (T-GYM1).
 *
 * Pure, because the rule is subtle enough that it deserves a test rather than
 * being spread across JSX conditionals in three surfaces.
 *
 * TWO SIGNALS THAT LOOK THE SAME AND ARE NOT:
 *
 *   venue        The gym this session is HELD AT. Renders the chip, the bold
 *                venue name and, when the gym itself is hosting, the square
 *                logo in place of the avatar. Requires an approval record:
 *                partner_status = 'approved' AND the partner still active.
 *
 *   affiliation  The gym this instructor COACHES AT. Renders the small
 *                "Coach BullBox" tag in the instructor row. A property of the
 *                person, not of the session, so it needs no approval.
 *
 * The spec asks for both in two places that read as contradictory: section 3
 * says "when session.partner ?? creator.partner exists, render the chip", while
 * section 1 says never to fall back to the creator's roster partner for a
 * session without partner_id, because that would put a gym's name on a session
 * it never approved. Section 1 is the one that protects the gym, and Al's
 * decision of 2026-09-08 is that the gym owns its name, so the fallback applies
 * to the affiliation tag only and never to the venue. The `??` expression
 * survives as "does this card show any gym element at all".
 *
 * Pending is deliberately asymmetric: the creator sees "Pendiente · {gym}" on
 * their own card, athletes see an ordinary session with a plain address.
 */

export interface SessionGymSource {
  id: string;
  business_name: string;
  business_type: string;
  logo_url: string | null;
  status: string;
  /**
   * featured_partners.user_id -- the gym's own account. Present only where the
   * caller needs to tell "the gym is hosting this" from "a coach is hosting at
   * the gym"; the feed selects it, surfaces that only render a chip may omit it.
   */
  user_id?: string | null;
}

export interface SessionGymIdentity {
  /** The approved venue. Drives the chip, the bold venue name, the logo. */
  venue: SessionGymSource | null;
  /** The creator's gym, for the "Coach {gym}" tag. */
  affiliation: SessionGymSource | null;
  /** Set only for the creator, only while awaiting the gym's decision. */
  pending: SessionGymSource | null;
  /** The gym's own account is hosting: it becomes the presenter. */
  gymHosted: boolean;
}

export interface ResolveSessionGymArgs {
  /** featured_partners row referenced by sessions.partner_id. */
  sessionPartner?: SessionGymSource | null;
  sessionPartnerStatus?: string | null;
  /** The gym whose roster the creator is on, if any. */
  creatorPartner?: SessionGymSource | null;
  /** users.id of the session's creator. */
  creatorId?: string | null;
  /** users.id of whoever is looking. Null when signed out. */
  viewerId?: string | null;
}

function isActive(partner: SessionGymSource | null | undefined): partner is SessionGymSource {
  return !!partner && partner.status === 'active';
}

export function resolveSessionGym({
  sessionPartner,
  sessionPartnerStatus,
  creatorPartner,
  creatorId,
  viewerId,
}: ResolveSessionGymArgs): SessionGymIdentity {
  const partnerActive = isActive(sessionPartner);
  const approved = partnerActive && sessionPartnerStatus === 'approved';

  // Only the creator is told a request is outstanding. To an athlete a pending
  // session is simply a session at an address, which is what it is until the
  // gym says otherwise.
  const isCreator = !!creatorId && !!viewerId && creatorId === viewerId;
  const pending = partnerActive && sessionPartnerStatus === 'pending' && isCreator ? sessionPartner : null;

  const venue = approved ? sessionPartner : null;

  // The gym's own account hosting its own session: the organization is the
  // presenter, so the card swaps the circle avatar for the square logo. Needs
  // the partner's user_id; without it this stays false and the card falls back
  // to the ordinary coach-hosted layout, which is the safe direction.
  const gymHosted = !!venue && !!creatorId && !!venue.user_id && venue.user_id === creatorId;

  return {
    venue,
    affiliation: isActive(creatorPartner) ? creatorPartner : null,
    pending,
    gymHosted,
  };
}

/** The single gym element the presenter row shows beside the instructor. */
export interface PresenterGymMark {
  gym: SessionGymSource;
  /**
   * True renders "Coach {gym}" -- this person coaches there. False renders the
   * gym name alone -- this session is merely held there.
   */
  asCoach: boolean;
}

/**
 * ONE gym element in the presenter row, never two.
 *
 * The venue and the affiliation are different facts -- "this session is at
 * BullBox" versus "this instructor coaches at BullBox" -- and in the common
 * case they are the same gym, so rendering both would print the name twice in
 * one row. Al asked for them collapsed (2026-09-10); this is the rule chosen.
 *
 * The affiliation wins when there is one, because THE VENUE IS ALREADY STATED:
 * it leads the location line in bold. The affiliation has nowhere else to live.
 * So when an instructor coaches at BullBox and hosts at some other approved
 * gym, the row reads "Coach CrossFit BullBox" while the location line names the
 * other gym -- both facts survive, neither is repeated.
 *
 * Nothing is returned for a gym-hosted session: GymHostRow already IS the gym,
 * and a second mark beside it would be the same logo twice on one card.
 */
export function presenterGymMark(identity: SessionGymIdentity): PresenterGymMark | null {
  if (identity.gymHosted) return null;
  if (identity.affiliation) return { gym: identity.affiliation, asCoach: true };
  if (identity.venue) return { gym: identity.venue, asCoach: false };
  return null;
}
