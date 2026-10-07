/**
 * T-AV23. Athlete attribution for the anonymous Pase path, in one place, for
 * both the pass page (the "Te invita" chip and the consent it shows) and
 * /api/pase (the stored row, consent and voucher QR). The page and the route
 * resolve the same link the same way, so what a guest is shown is what gets
 * stored.
 *
 * WHAT THIS DECIDES, AND WHAT IT DOES NOT (Al, 2026-09-30, override to the
 * T-AV23 ticket). It decides ATTRIBUTION only: the athlete whose code this
 * is. It never applies a credit rule. Self-referral, returning guests,
 * duplicates and already-members are all attributed, and av_athletes_ledger
 * (205) alone decides credit. Two places deciding credit is how an athlete
 * and a gym end up seeing different numbers.
 *
 * FAILURE IS SILENT TO THE GUEST AND LOUD IN THE LOG. Any error is logged and
 * the answer degrades to "no attribution"; the lead is still saved and the
 * response is still 200. A broken attribution lookup must never cost a lead.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { readAthleteValueConfig, type AthleteValueConfig } from '@/lib/features/athleteValue';
import { athletesAttributionConfigured, athletesAttributionEnabled } from '@/lib/features/athletesAttribution';
import { fetchAthleteProgramStatus, findActiveAthleteByRefCode } from '@/lib/dal/athleteReferral';
import { consentTextFor, consentTextForAttributed } from '@/lib/pase/consent';

/** The link shape: /pase/{slug}/?src=atleta&code={ref_code}. */
export const ATHLETE_SRC = 'atleta';
/** program_athletes_ref_code_check, case-insensitive: the lookup uppercases. */
const REF_CODE_SHAPE = /^[A-Za-z0-9-]{4,24}$/;

export interface AttributionResult {
  /** The predicate is true for this partner: the voucher QR is shown. */
  on: boolean;
  programAthleteId: string | null;
  firstName: string | null;
}

const OFF: AttributionResult = { on: false, programAthleteId: null, firstName: null };

/**
 * With the flag off (the environment half), this returns before touching the
 * database, so flag-off /api/pase makes exactly the queries it made before.
 * src and code may be raw query-string values: the shape check here is the
 * one rule, used by the page and the route alike.
 */
export async function resolveAthleteAttribution(
  supabase: SupabaseClient,
  partnerId: string,
  src: string | null | undefined,
  code: string | null | undefined,
  config: AthleteValueConfig = readAthleteValueConfig()
): Promise<AttributionResult> {
  if (!athletesAttributionConfigured(config)) return OFF;

  let on = false;
  try {
    on = athletesAttributionEnabled(await fetchAthleteProgramStatus(supabase, partnerId), config);
    if (!on || src !== ATHLETE_SRC || !code || !REF_CODE_SHAPE.test(code)) {
      return { on, programAthleteId: null, firstName: null };
    }
    const athlete = await findActiveAthleteByRefCode(supabase, partnerId, code);
    return athlete
      ? { on, programAthleteId: athlete.programAthleteId, firstName: athlete.firstName }
      : { on, programAthleteId: null, firstName: null };
  } catch (error: unknown) {
    // The partner id, never the code or anything about the guest.
    logError(error, { action: 'resolveAthleteAttribution', partnerId });
    return { on, programAthleteId: null, firstName: null };
  }
}

export interface AttributedConsent {
  consentText: string;
  /** Set only when the lead is attributed AND its consent fits the CHECK. */
  referredByAthleteId: string | null;
  /** The first name for the "Te invita" chip, under the same condition. */
  invitedByFirstName: string | null;
  /** Attribution resolved but the consent would exceed 500 characters. */
  overLimit: boolean;
}

/** What to show and store, given a resolved attribution. One rule for both. */
export function consentForAttribution(partnerName: string, attribution: AttributionResult): AttributedConsent {
  if (!attribution.programAthleteId || !attribution.firstName) {
    return {
      consentText: consentTextFor(partnerName),
      referredByAthleteId: null,
      invitedByFirstName: null,
      overLimit: false,
    };
  }
  const text = consentTextForAttributed(partnerName, attribution.firstName);
  if (text === null) {
    return {
      consentText: consentTextFor(partnerName),
      referredByAthleteId: null,
      invitedByFirstName: null,
      overLimit: true,
    };
  }
  return {
    consentText: text,
    referredByAthleteId: attribution.programAthleteId,
    invitedByFirstName: attribution.firstName,
    overLimit: false,
  };
}

/**
 * The QR the coach scans at the door: the absolute /pase/verificar URL on
 * whichever origin served the claim (local, preview or production). The
 * renderer is imported here, lazily, and only by callers that already know
 * the flag is on, so a flag-off request never loads it. A failure costs the
 * QR, never the claim.
 */
export async function renderVoucherQr(origin: string, passCode: string): Promise<string | null> {
  try {
    const { renderQrSvg } = await import('@/lib/qr/renderQrSvg');
    return renderQrSvg(`${origin}/pase/verificar/${passCode}/`, `Código QR del pase ${passCode}`);
  } catch (error: unknown) {
    logError(error, { action: 'renderVoucherQr' });
    return null;
  }
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The pass page's entry point. Reads searchParams ONLY when attribution is
 * configured, so a flag-off render does exactly what it did before T-AV23:
 * no query, no read of the query string, the V1 consent, no chip.
 */
export async function consentForPassPage(
  supabase: SupabaseClient,
  partnerId: string,
  partnerName: string,
  searchParams: Promise<SearchParams> | undefined
): Promise<AttributedConsent> {
  if (!athletesAttributionConfigured()) return consentForAttribution(partnerName, OFF);
  const sp: SearchParams = (await searchParams) ?? {};
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const attribution = await resolveAthleteAttribution(supabase, partnerId, one(sp.src), one(sp.code));
  return consentForAttribution(partnerName, attribution);
}
