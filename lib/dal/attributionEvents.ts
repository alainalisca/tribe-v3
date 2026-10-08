/**
 * DAL: the attribution visit log (T-GROW1 part D). SERVICE-ROLE ONLY.
 *
 * WHY SERVICE ROLE, AND WHY THERE IS NO OTHER OPTION HERE.
 *
 * Migration 213 enables RLS on attribution_events with ZERO policies and revokes
 * every privilege from anon and authenticated, so no client role can read or
 * write this table by any route. That is narrower than pass_leads, where 173 had
 * to grant anon INSERT because the pass form posts before anybody is signed in --
 * here the write goes through POST /api/attr, which runs server side, so the
 * client never needs to touch the table at all and therefore is not allowed to.
 *
 * The consequence worth stating: there is NO anon insert path to forge visits
 * through. Every row in this table was written by our own route behind a rate
 * limit, which is what makes the Origen tab's visit counts worth quoting.
 *
 * THE UNIQUE VIOLATION IS A SUCCESS, NOT AN ERROR. attribution_events has a
 * partial unique index making a session's `visit` once-per-session, so a reload,
 * a double-fired effect or a retried beacon lands on it. That is the index doing
 * its job, and reporting it as a failure would put a log line and a 500 on the
 * most normal thing a browser does. Only 23505 is treated this way; every other
 * error is a real one.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { Attribution } from '@/lib/attribution';

/** The vocabulary attribution_events_event_type_check admits. */
export const ATTR_EVENT_TYPES = ['visit', 'pass_view', 'share_click'] as const;
export type AttrEventType = (typeof ATTR_EVENT_TYPES)[number];

export function isAttrEventType(value: unknown): value is AttrEventType {
  return typeof value === 'string' && (ATTR_EVENT_TYPES as readonly string[]).includes(value);
}

export interface AttributionEventInput {
  event_type: AttrEventType;
  session_key: string;
  attribution: Attribution;
}

/** Why an insert did not produce a new row. `duplicate` is not a failure. */
export type AttrInsertOutcome = 'inserted' | 'duplicate';

/**
 * Record one attribution event.
 *
 * Returns 'duplicate' when the once-per-session index refused a second visit, so
 * the caller can answer 204 either way without pretending something happened that
 * did not. A caller that only learned "ok" could not tell a logged visit from a
 * deduplicated one, and the difference is the whole reason the index exists.
 *
 * `ref` maps to the attr_ref COLUMN. The URL parameter is ?ref= and the column is
 * attr_ref, because migrationAppliedBeforeCode.test.ts matches a column name as a
 * substring of source text and "ref" appears in 708 source files. Migration 211's
 * header carries the full reasoning; this is the one line of code where the two
 * names meet, which is why it is spelled out here rather than left to the reader.
 */
export async function insertAttributionEvent(
  supabase: SupabaseClient,
  input: AttributionEventInput
): Promise<DalResult<AttrInsertOutcome>> {
  const { event_type, session_key, attribution } = input;

  try {
    const { error } = await supabase.from('attribution_events').insert({
      event_type,
      session_key,
      src: attribution.src,
      code: attribution.code,
      attr_ref: attribution.ref,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_content: attribution.utm_content,
      landing_path: attribution.landing_path,
    });

    if (error) {
      // 23505 is the partial unique index refusing a second visit for this
      // session. Expected, frequent, and not a failure.
      if (error.code === '23505') return { success: true, data: 'duplicate' };
      logError(error, { action: 'insertAttributionEvent', eventType: event_type });
      return { success: false, error: error.message };
    }

    return { success: true, data: 'inserted' };
  } catch (error) {
    logError(error, { action: 'insertAttributionEvent', eventType: event_type });
    return { success: false, error: 'Failed to record the attribution event' };
  }
}
