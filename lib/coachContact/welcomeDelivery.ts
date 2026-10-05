/**
 * T-AV33 (P1-6). Turn a welcome the database decided (migration 8005) into
 * the person's notification: an in-app row, and one push only when the
 * database said it is within the cap, through the consolidated path
 * (dispatchPush, /api/notifications/send). Nothing here decides WHETHER.
 *
 * Copy is in the RECIPIENT's language. The body is the coach's own words.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/dal/notifications';
import type { ClaimedWelcome } from '@/lib/dal/coachWelcome';
import { dispatchPush } from '@/lib/atletas/athleteNotifications';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isEnabledByConfig, isFeatureListed, readAthleteValueConfig } from '@/lib/features/athleteValue';
import { claimWelcomeForPass } from '@/lib/dal/coachWelcome';
import { logError } from '@/lib/logger';

export const WELCOME_FEATURE = 'welcome';

export function renderWelcome(n: ClaimedWelcome): { title: string; body: string; url: string; type: string } {
  const es = n.language !== 'en';
  const title = n.coachFirstName
    ? es
      ? `Mensaje de ${n.coachFirstName}`
      : `A note from ${n.coachFirstName}`
    : es
      ? 'Mensaje de tu coach'
      : 'A note from your coach';
  return { title, body: n.note, url: `/storefront/${n.coachId}/`, type: 'av_welcome' };
}

/**
 * Writes with the SERVICE ROLE: the in-app row's actor is the coach, not the
 * person whose request this is, and a user client should not be the one to
 * write a notification attributed to somebody else.
 */
export async function deliverWelcome(claimed: readonly ClaimedWelcome[], origin: string): Promise<number> {
  const admin = getServiceRoleClient();
  let pushed = 0;
  for (const n of claimed) {
    const r = renderWelcome(n);
    const inApp = await createNotification(admin, {
      recipient_id: n.recipientId,
      actor_id: n.coachId,
      type: r.type,
      entity_type: 'user',
      entity_id: n.coachId,
      message: `${r.title}: ${r.body}`,
      action_url: r.url,
    });
    if (!inApp.success) logError(inApp.error, { action: 'av_welcome_in_app' });
    if (n.push && (await dispatchPush(origin, { recipientId: n.recipientId, ...r }))) pushed += 1;
  }
  return pushed;
}

/**
 * /api/pase's hook. The claimant is whoever is signed in on THIS request,
 * resolved from their own session and never from the form; signed out, or the
 * feature off for them, means nothing happens. Best effort: the Pass is saved
 * whatever happens here.
 *
 * The public Pass route must not even READ the session with the program off
 * (route.flagoff.test.ts pins that), so the env config is checked first. And,
 * as lib/features/athletesAttribution.ts decided for the same route, there is
 * no app-admin pass-through here: on a public form an admin is a claimant.
 */
export async function welcomePassClaimant(service: SupabaseClient, leadId: string, origin: string): Promise<void> {
  try {
    const config = readAthleteValueConfig();
    if (config.mode === 'off' || !isFeatureListed(config, WELCOME_FEATURE)) return;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isEnabledByConfig(config, user.id)) return;
    const claimed = await claimWelcomeForPass(service, leadId, user.id);
    if (claimed.success) await deliverWelcome(claimed.data ?? [], origin);
  } catch (error) {
    logError(error, { action: 'av_welcome_pass', passLeadId: leadId });
  }
}
