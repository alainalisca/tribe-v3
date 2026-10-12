/**
 * The code a pass lead shares in a "Trae a un amigo" link: K7Q2MZ.
 *
 * Spec T-GROW2 A: six characters, no 0/O/1/I. Same alphabet as the pass code
 * (declared here, NOT imported: several /api/pase tests mock lib/pase/passCode
 * whole, and an import made every one of them 500; leadRefCode.test.ts asserts
 * the two alphabets are equal, so they still cannot drift), and the shape migration 215's
 * pass_leads_lead_ref_code_shape CHECK enforces. 32^6 is about a billion codes;
 * the unique index is the authority and /api/pase retries on a collision.
 *
 * NOT a secret and NOT the pass_code. Nothing is authorised by holding it; it
 * only credits the person who shared it.
 */
/** Equal to PASS_CODE_ALPHABET; asserted in leadRefCode.test.ts. */
export const LEAD_REF_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const LEAD_REF_CODE_LENGTH = 6;

/** Mirrors migration 215's CHECK exactly. */
export const LEAD_REF_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

export function generateLeadRefCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < LEAD_REF_CODE_LENGTH; i++) {
    code += LEAD_REF_CODE_ALPHABET[Math.floor(random() * LEAD_REF_CODE_ALPHABET.length)];
  }
  return code;
}
