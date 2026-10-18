import 'server-only';
import { unstable_cache } from 'next/cache';
import { logError } from '@/lib/logger';
import { chooseCardPhoto, coachCardVersion, type CoachRow } from '@/lib/og/coachCard';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { bogotaDateOffset, bogotaToday } from '@/lib/time/bogotaDate';
import { WEEK_SESSION_SELECT } from './week';
import { buildWeekSeries, type BoardSessionRow } from './weekBoard';
import type { WeekRow } from './weekTypes';

/**
 * T-SHARE1 Part E. What the public coach page (/i/<handle>) shows besides the
 * coach's own row: their upcoming sessions and their hero photo.
 *
 * Sessions: the same select and the same rules as "La semana" (lib/site/week:
 * active, public, a listed creator, one row per series), over the next 30 days,
 * at most 8 rows. Service role and server only, like the board.
 *
 * The hero is the share card's photo (lib/og/coachCard's order: the pick, the
 * best gallery photo, a sharp avatar), so the page and the card agree. Choosing
 * may download a few images to measure them, so the choice is cached per coach
 * and per card fingerprint: a new pick or gallery is a new key.
 */
export const COACH_PAGE_DAYS = 30;
export const COACH_PAGE_MAX = 8;

/** The coach's upcoming sessions, soonest first. Empty on any failure. */
export async function fetchCoachSessions(coachId: string, now = new Date()): Promise<WeekRow[]> {
  const today = bogotaToday(now);
  const lastDay = bogotaDateOffset(COACH_PAGE_DAYS, now);
  const nowTime = now.toLocaleTimeString('en-GB', { timeZone: 'America/Bogota', hour12: false }).slice(0, 5);
  try {
    const { data, error } = await getServiceRoleClient()
      .from('sessions')
      .select(WEEK_SESSION_SELECT)
      .eq('creator_id', coachId)
      .eq('status', 'active')
      .eq('visibility', 'public')
      .gte('date', today)
      .lte('date', lastDay)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(200);
    if (error) {
      logError(error, { action: 'site.fetchCoachSessions', coachId });
      return [];
    }
    const raw = (data ?? []) as unknown as BoardSessionRow[];
    return buildWeekSeries(raw, today, lastDay, nowTime).slice(0, COACH_PAGE_MAX);
  } catch (error) {
    logError(error, { action: 'site.fetchCoachSessions', coachId });
    return [];
  }
}

/**
 * The hero photo and where to anchor it, as object-position percentages: the
 * card box's centre across, and its TOP down. The page frame (4:5, 16:9) is a
 * different shape from the card, and the box was drawn to include the head, so
 * anchoring on the box's top keeps the face in the frame where its centre
 * would cut it (measured: Venom and Andrés at 16:9).
 */
export type HeroPhoto = { url: string; x: number; y: number };

const round1 = (v: number) => Math.round(v * 1000) / 10;

/** The card's photo for this coach, or null for the initials block. Never throws. */
export async function coachHeroPhoto(coach: CoachRow): Promise<HeroPhoto | null> {
  const pick = async (): Promise<HeroPhoto | null> => {
    const picked = await chooseCardPhoto(coach);
    if (!picked) return null;
    const box = picked.choice.box;
    // With no box: centred across, anchored high (faces sit high in a portrait).
    return box
      ? { url: picked.choice.url, x: round1((box.x0 + box.x1) / 2), y: round1(box.y0) }
      : { url: picked.choice.url, x: 50, y: 20 };
  };
  try {
    return await unstable_cache(pick, ['coach-hero-v2', coach.id, coachCardVersion(coach, null)], {
      revalidate: 86400,
    })();
  } catch (error) {
    logError(error, { action: 'site.coachHeroPhoto', coachId: coach.id });
    return null;
  }
}
