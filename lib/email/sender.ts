/**
 * The ONE place Tribe's outgoing email address is defined.
 *
 * Until 2026-10-10 the sender was hard-coded as 'Tribe <tribe@aplusfitnessllc.com>'
 * in 17 separate places (16 senders and the calendar invite's organizer), so a stranger who claimed a pass on tribelatam.com got
 * an email from a domain they had never seen. Changing it meant 17 edits, which
 * is how one gets missed. lib/email/sender.test.ts fails if a sender address is
 * written anywhere else again.
 *
 * Why info@tribelatam.com works, all set up and verified 2026-10-10:
 *   - Resend: tribelatam.com verified (DKIM resend._domainkey, SPF via the
 *     send/rsend CNAMEs, DMARC p=none). Same Resend team as RESEND_API_KEY, so
 *     no new key.
 *   - Google Workspace: tribelatam.com is a secondary domain with Gmail active
 *     (MX smtp.google.com), and info@ is an alternate address on Al's account,
 *     so a reply to any Tribe email lands in his inbox.
 *
 * If either is ever removed, every Tribe email fails or bounces. Check Resend
 * and Workspace before touching this.
 */
export const TRIBE_SENDER_ADDRESS = 'info@tribelatam.com';

/** Display name + address, the `from` for every email Tribe sends. */
export const TRIBE_FROM = `Tribe <${TRIBE_SENDER_ADDRESS}>`;

/** The feedback widget's emails, so they sort apart in the admin inbox. */
export const TRIBE_FEEDBACK_FROM = `Tribe Feedback <${TRIBE_SENDER_ADDRESS}>`;
