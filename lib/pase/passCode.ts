/**
 * The short code a person quotes at reception: BB-4F7K.
 *
 * It is read aloud over a noisy gym floor and typed from memory, so the
 * alphabet drops the four characters that get confused in that setting:
 * 0 and O, 1 and I. What is left is 32 characters, and four of them is
 * 32^4 = 1,048,576 codes per prefix -- comfortably more than a partner will
 * ever issue, while staying short enough to say in one breath.
 *
 * It is NOT a secret and nothing is authorised by holding one. It is a
 * conversation handle between the person and the gym.
 */

/** No 0/O/1/I. Matches pass_leads_pass_code in migration 173. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUFFIX_LENGTH = 4;

/**
 * Two letters for the code: bullbox -> BB, salomon -> SA.
 *
 * THE DEFAULT IS THE SLUG'S FIRST TWO LETTERS, and for bullbox that is BU, not
 * the BB the ticket asks for. BB is the brand's own initials -- BullBox, with a
 * capital B in the middle that the slug threw away when 163 lowercased it.
 * There is no rule recoverable from "bullbox" that yields BB, so it is stated
 * rather than derived.
 *
 * The override map is deliberately tiny and deliberately not a database
 * column. Getting it wrong is cosmetic: a code reads BU-4F7K instead of
 * BB-4F7K and still works everywhere it is used. A column would mean a new
 * partner is unservable until someone fills it in, which is the wrong failure
 * for a value that has a perfectly good default.
 */
const PREFIX_OVERRIDES: Readonly<Record<string, string>> = {
  bullbox: 'BB',
};

/**
 * Letters only, so a slug like "crossfit-90" cannot produce a prefix the
 * pass_code CHECK rejects. A slug with fewer than two letters falls back to
 * TB, which is a real possibility -- 163's slugify permits digits and hyphens
 * and guarantees nothing about letters.
 */
export function prefixForSlug(slug: string): string {
  const key = (slug ?? '').toLowerCase();
  const override = PREFIX_OVERRIDES[key];
  if (override) return override;

  const letters = key.toUpperCase().replace(/[^A-Z]/g, '');
  if (letters.length >= 2) return letters.slice(0, 2);
  return 'TB';
}

/**
 * One candidate code. Uniqueness is the database's job: the caller retries on
 * a unique violation rather than checking first, because a check-then-insert
 * is a race under concurrent claims.
 */
export function generatePassCode(slug: string, random: () => number = Math.random): string {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return `${prefixForSlug(slug)}-${suffix}`;
}

/** Exported for the test, so the alphabet cannot drift from its own assertions. */
export const PASS_CODE_ALPHABET = ALPHABET;
