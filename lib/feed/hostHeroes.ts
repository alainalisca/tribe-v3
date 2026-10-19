import 'server-only';
import { COACH_SELECT, type CoachRow } from '@/lib/og/coachCard';
import { coachHeroPhoto, type HeroPhoto } from '@/lib/site/coachPage';
import { isVisibleUser } from '@/lib/dal/visibleUsers';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logger';

/**
 * T-UI-FD1: the feed cards' photos, the host's coach-card photo by the same
 * chain as the session page and the WhatsApp card (card_photo_url, then
 * gallery or cover, then a sharp avatar). One read for every host on the
 * page, then coachHeroPhoto per host (cached per coach for a day).
 *
 * The answer maps a host id to its photo, or to null when the host has no
 * usable photo (the card shows its sport colours instead). A host still being
 * picked when the time is up is left out, and the card treats it as null.
 * Never a test, banned or deleted account.
 */
export const MAX_HOSTS = 60;
export const HOST_HEROES_TIMEOUT_MS = 2500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function hostHeroesFor(
  ids: string[],
  timeoutMs: number = HOST_HEROES_TIMEOUT_MS
): Promise<Record<string, HeroPhoto | null>> {
  const wanted = [...new Set(ids.filter((id) => UUID.test(id)).map((id) => id.toLowerCase()))].slice(0, MAX_HOSTS);
  if (wanted.length === 0) return {};
  const { data, error } = await getServiceRoleClient().from('users').select(COACH_SELECT).in('id', wanted);
  if (error) {
    logError(error, { action: 'feed.hostHeroes.read' });
    return {};
  }
  const out: Record<string, HeroPhoto | null> = {};
  const hosts = ((data ?? []) as unknown as CoachRow[]).filter((c) => isVisibleUser(c));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const picks = Promise.all(
    hosts.map(async (host) => {
      out[host.id] = await coachHeroPhoto(host).catch(() => null);
    })
  );
  await Promise.race([picks, new Promise((resolve) => (timer = setTimeout(resolve, timeoutMs)))]);
  clearTimeout(timer);
  return { ...out };
}
