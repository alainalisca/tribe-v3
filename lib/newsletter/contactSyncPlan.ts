/**
 * Newsletter contact sync: the DECISION, with no I/O.
 *
 * Tribe's newsletter is sent from Resend Broadcasts to Resend's own contact
 * list. The app has its own opt-out (notification_preferences.
 * email_unsubscribed_at, migration 188). Before this module the two never
 * spoke: an unsubscribe clicked in a newsletter left the app thinking the
 * person could be emailed, and an opt-out made in the app left Resend thinking
 * they were subscribed. The next issue, built from a fresh export, would mail
 * people who had already said no.
 *
 * This function takes both sides as plain data and returns what to change.
 * The cron route performs the changes. Keeping the decision pure is what makes
 * every rule below testable without a network or a database.
 *
 * THE RULES, IN THE ORDER THEY APPLY
 *
 *   1. PULL. A Resend contact marked unsubscribed whose address belongs to a
 *      Tribe user who is not yet suppressed -> suppress that user in the app.
 *      Runs first, so a newsletter unsubscribe can never be undone by step 3.
 *
 *   2. PUSH. A Tribe user who is suppressed, whose contact in Resend is still
 *      subscribed -> mark the contact unsubscribed.
 *
 *   3. CREATE. An eligible, unsuppressed Tribe user with no contact -> create
 *      one. Nobody is ever created already-unsubscribed: a suppressed person
 *      with no contact simply stays out of Resend.
 *
 *   4. REMOVE. A contact whose address matches no current Tribe user (account
 *      deleted, banned, test, or email changed) -> remove it. A deleted
 *      account's address should not sit in a marketing list.
 *
 * THINGS IT NEVER DOES
 *
 *   - Flip a contact from unsubscribed back to subscribed. Resubscribing is
 *     the person's action, never a sync side effect.
 *   - Clear email_unsubscribed_at in the app.
 *
 * THE BRAKE. If removals would exceed REMOVE_BRAKE_FRACTION of the Resend list,
 * the plan refuses (`refused` set, every list but pullUnsubscribe empty). A bad read of the app
 * side, such as an empty audience from a failed query that did not error,
 * would otherwise look exactly like "everyone deleted their account" and wipe
 * the newsletter list. Wrong-and-loud beats wrong-and-silent here.
 */

/** One Tribe account, as the sync needs to see it. */
export interface AppMember {
  userId: string;
  /** The address the person signed up with. Compared case-insensitively. */
  email: string;
  firstName: string | null;
  role: 'athlete' | 'instructor';
  /** email_unsubscribed_at is set. */
  suppressed: boolean;
  /** Not deleted, not banned, not a test account, email confirmed. */
  eligible: boolean;
}

/** One Resend contact, as the sync needs to see it. */
export interface ResendMember {
  contactId: string;
  email: string;
  unsubscribed: boolean;
}

export interface ContactToCreate {
  email: string;
  firstName: string | null;
  role: AppMember['role'];
}

export interface ContactSyncPlan {
  /** App user ids to mark email_unsubscribed_at. */
  pullUnsubscribe: string[];
  /** Resend contact ids to mark unsubscribed. */
  pushUnsubscribe: string[];
  create: ContactToCreate[];
  /** Resend contact ids to remove. */
  remove: string[];
  /** Set when the brake fired; every list above except pullUnsubscribe is then empty. */
  refused: string | null;
}

/**
 * Removing more than this share of the Resend list in one run is treated as a
 * bad read, not as real churn. At 80 contacts that is 16 removals; real
 * account deletions run at a handful a month.
 */
export const REMOVE_BRAKE_FRACTION = 0.2;

/**
 * Below this many contacts the fraction is meaningless (1 of 3 is 33%), so the
 * brake only applies once the list is at least this big.
 */
export const REMOVE_BRAKE_MIN_LIST = 10;

const norm = (email: string): string => email.trim().toLowerCase();

export function planContactSync(app: AppMember[], resend: ResendMember[]): ContactSyncPlan {
  // Only members who could legitimately be on the list are matched. An
  // ineligible member (deleted, banned, test, unconfirmed) is treated as absent,
  // so their contact is removed rather than kept in sync.
  const eligibleByEmail = new Map<string, AppMember>();
  for (const m of app) {
    if (m.eligible && m.email) eligibleByEmail.set(norm(m.email), m);
  }
  const contactByEmail = new Map<string, ResendMember>();
  for (const c of resend) contactByEmail.set(norm(c.email), c);

  const pullUnsubscribe: string[] = [];
  const pushUnsubscribe: string[] = [];
  const create: ContactToCreate[] = [];
  const remove: string[] = [];

  // 1. PULL, recorded in a local set so steps 2 and 3 see its effect.
  const suppressed = new Set<string>();
  for (const [email, m] of eligibleByEmail) {
    if (m.suppressed) {
      suppressed.add(email);
      continue;
    }
    const contact = contactByEmail.get(email);
    if (contact?.unsubscribed) {
      pullUnsubscribe.push(m.userId);
      suppressed.add(email);
    }
  }

  for (const [email, m] of eligibleByEmail) {
    const contact = contactByEmail.get(email);
    // 2. PUSH
    if (suppressed.has(email)) {
      if (contact && !contact.unsubscribed) pushUnsubscribe.push(contact.contactId);
      continue;
    }
    // 3. CREATE
    if (!contact) create.push({ email: m.email.trim(), firstName: m.firstName, role: m.role });
  }

  // 4. REMOVE
  for (const [email, c] of contactByEmail) {
    if (!eligibleByEmail.has(email)) remove.push(c.contactId);
  }

  if (resend.length >= REMOVE_BRAKE_MIN_LIST && remove.length > resend.length * REMOVE_BRAKE_FRACTION) {
    // PULL survives the brake. Honouring an opt-out is never the wrong move,
    // and a bad read of the app side can only make it match fewer people.
    return {
      pullUnsubscribe,
      pushUnsubscribe: [],
      create: [],
      remove: [],
      refused: `would remove ${remove.length} of ${resend.length} contacts (limit ${Math.round(REMOVE_BRAKE_FRACTION * 100)}%)`,
    };
  }

  return { pullUnsubscribe, pushUnsubscribe, create, remove, refused: null };
}
