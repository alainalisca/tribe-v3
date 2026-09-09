import type { TranslationKey } from '@/lib/translations';
import type { SessionWithRelations } from '@/lib/dal';

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
   * Above-the-fold card: loads its hero eagerly at high fetch priority.
   * The home feed sets this for the first two cards only.
   */
  priority?: boolean;
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

export function computeSessionStatus(session: SessionWithRelations) {
  const isPast = getSessionEndsAt(session) < new Date();

  const isFull = (session.current_participants ?? 0) >= session.max_participants;

  const isStartingSoon =
    !isPast &&
    (() => {
      const sessionDateTime = new Date(`${session.date}T${session.start_time}`);
      const now = new Date();
      const diffMs = sessionDateTime.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      return diffHours > 0 && diffHours <= 2;
    })();

  const confirmedParticipants = session.participants?.filter((p) => p.status === 'confirmed') || [];

  return { isPast, isFull, isStartingSoon, confirmedParticipants };
}
