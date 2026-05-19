/**
 * Cron request authentication.
 *
 * Every /api/cron/* route previously did:
 *   if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) reject
 *
 * That FAILS OPEN on a misconfigured environment: if CRON_SECRET is
 * unset the expected value is the literal `Bearer undefined`, and if
 * it's empty it's `Bearer ` — either is trivially guessable, making
 * every scheduled job (recurring sessions, subscription expiry, lead
 * credit resets, nudges, ...) world-callable. This helper FAILS
 * CLOSED: no request is authorized unless a non-empty CRON_SECRET is
 * set and the bearer token matches it exactly (constant-time).
 */
import { timingSafeEqual } from 'node:crypto';

export function isValidCronAuth(authHeader: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed: a missing/empty secret never authorizes anyone.
  if (!secret || secret.length === 0) return false;
  if (!authHeader) return false;

  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — guard first. The
  // length itself isn't secret (it's `Bearer ` + the secret length).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
