import type { TranslationKey } from '@/lib/translations';
import type { SessionWithRelations } from '@/lib/dal';
import type { SessionGymSource } from '@/lib/sessionGym';
import { athleteRoster } from '@/lib/sessionRoster';

export interface SessionCardProps {
  session: SessionWithRelations;
  onShare?: (session: SessionWithRelations) => void;
  onJoin?: (sessionId: string) => void;
  onEdit?: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
  userLocation?: { latitude: number; longitude: number } | null;
  currentUserId?: string;
  distance?: string;
  liveData?: { count: number; users: Array<{ name: string; avatar_url: string | null }> };
  /** Set of user IDs that are active featured partners (or their instructors) */
  featuredPartnerUserIds?: Set<string>;
  /**
   * T-GYM1. Both are resolved by the feed in one batched query for the whole
   * page, never per card.
   *   sessionPartner  the gym on sessions.partner_id -- the venue.
   *   creatorPartner  the gym whose roster the creator is on -- the affiliation.
   * They are different questions: the venue needs the gym's approval, the
   * affiliation describes the person. See lib/sessionGym.ts.
   */
  sessionPartner?: SessionGymSource | null;
  creatorPartner?: SessionGymSource | null;
  /** Active roster size, only needed when the gym account is the host. */
  partnerCoachCount?: number;
  /**
   * Above-the-fold card: loads its hero eagerly at high fetch priority.
   * The home feed sets this for the first two cards only.
   */
  priority?: boolean;
  /**
   * The instructor's recent recap photos, newest first, already filtered for
   * `reported`. Supplied by the feed in one batched query for the whole page;
   * other call sites may omit it and the carousel simply has fewer slides.
   */
  recapPhotos?: string[];
}

export function getSkillLevelDisplay(level: string, t: (key: TranslationKey) => string) {
  switch (level) {
    case 'beginner':
      return { emoji: '🌱', label: t('beginner'), color: 'bg-green-100 text-green-800' };
    case 'intermediate':
      return { emoji: '💪', label: t('intermediate'), color: 'bg-blue-100 text-blue-800' };
    case 'advanced':
      return { emoji: '🔥', label: t('advanced'), color: 'bg-orange-100 text-orange-800' };
    case 'all_levels':
    default:
      return { emoji: '🌟', label: t('allLevels'), color: 'bg-purple-100 text-purple-800' };
  }
}

export function getGenderDisplay(gender: string, t: (key: TranslationKey) => string) {
  switch (gender) {
    case 'women_only':
      return { emoji: '👩', label: t('womenOnly'), color: 'bg-pink-100 text-pink-800' };
    case 'men_only':
      return { emoji: '👨', label: t('menOnly'), color: 'bg-sky-100 text-sky-800' };
    case 'all':
    default:
      return null; // Don't show badge for "all welcome"
  }
}

/**
 * When a session finishes, as a local Date.
 *
 * Sessions are stored as wall-clock Bogota date + time, so this builds a local
 * Date rather than parsing a UTC instant. A session with no start_time is
 * treated as running until the end of its day.
 *
 * Exported so the feed's "hide it once it is over" rule and the card's own
 * isPast agree by construction instead of by two similar-looking snippets.
 */
export function getSessionEndsAt(session: Pick<SessionWithRelations, 'date' | 'start_time' | 'duration'>): Date {
  const endsAt = new Date(session.date + 'T00:00:00');
  if (session.start_time) {
    const [hours, minutes] = session.start_time.split(':').map(Number);
    endsAt.setHours(hours, minutes, 0, 0);
    endsAt.setMinutes(endsAt.getMinutes() + (session.duration || 60));
  } else {
    endsAt.setHours(23, 59, 59, 999);
  }
  return endsAt;
}

/** Grace period the home feed keeps a just-finished session visible for. */
export const FEED_ENDED_GRACE_MINUTES = 30;

/**
 * Whether a session finished long enough ago that the home feed should drop it.
 *
 * fetchUpcomingSessions filters on date only, so without this a 6:30pm session
 * stays in the feed until midnight.
 */
export function isPastFeedGrace(
  session: Pick<SessionWithRelations, 'date' | 'start_time' | 'duration'>,
  now: Date = new Date()
): boolean {
  return now.getTime() - getSessionEndsAt(session).getTime() > FEED_ENDED_GRACE_MINUTES * 60 * 1000;
}

/**
 * ONE capacity source, and it is the database counter.
 *
 * `sessions.current_participants` is maintained by
 * trg_sync_session_participant_count (migration 087) as
 * `count(*) WHERE status = 'confirmed'`, recomputed from scratch on every
 * session_participants write. Three reasons it wins over counting the roster
 * array client-side:
 *
 *  1. THE ARRAY IS NOT ALWAYS THERE. fetchUpcomingSessions
 *     (lib/dal/sessions.ts:415) returns every session with `participants: []`,
 *     and that is the home feed -- the only production consumer of this
 *     component. Counting the array there yields 0 for every session forever.
 *  2. THE REST OF THE APP ALREADY DOES THIS. app/os/schedule reads
 *     `current_participants ?? 0` as "enrolled"; postSession/RebookingStep
 *     computes spotsLeft from it. SessionCard was the outlier.
 *  3. It is one number rather than a length that depends on which query loaded
 *     the page.
 *
 * Since migration 169 the counter IS the athlete count: the 23 rows in which a
 * host was recorded as a participant of their own session are gone, and
 * verify-migration-state.sql asserts none has come back. If one ever does the
 * counter over-counts again by one, and that guard is what says so.
 */
export function computeSessionStatus(session: SessionWithRelations) {
  const isPast = getSessionEndsAt(session) < new Date();

  const athleteCount = session.current_participants ?? 0;
  const isFull = athleteCount >= session.max_participants;

  const isStartingSoon =
    !isPast &&
    (() => {
      const sessionDateTime = new Date(`${session.date}T${session.start_time}`);
      const now = new Date();
      const diffMs = sessionDateTime.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      return diffHours > 0 && diffHours <= 2;
    })();

  // The roster rows this particular query happened to load. For rendering
  // AVATARS ONLY -- you cannot draw a face you do not have -- and never for
  // counting, which is what athleteCount is for. Named to make the misuse
  // awkward: it used to be called confirmedParticipants and was silently the
  // source of spotsLeft, fillingFast and the rendered n/max.
  //
  // Still filtered through lib/sessionRoster so the host does not appear among
  // the avatars, matching ParticipantList (see that module's header).
  const rosterForAvatars = athleteRoster(session.participants, session.creator_id);

  return { isPast, isFull, isStartingSoon, athleteCount, rosterForAvatars };
}
