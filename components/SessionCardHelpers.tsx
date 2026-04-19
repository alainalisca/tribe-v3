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

export function computeSessionStatus(session: SessionWithRelations) {
  const isPast = (() => {
    const sessionDate = new Date(session.date + 'T00:00:00');
    if (session.start_time) {
      const [hours, minutes] = session.start_time.split(':').map(Number);
      sessionDate.setHours(hours, minutes, 0, 0);
      sessionDate.setMinutes(sessionDate.getMinutes() + (session.duration || 60));
    } else {
      sessionDate.setHours(23, 59, 59, 999);
    }
    return sessionDate < new Date();
  })();

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
