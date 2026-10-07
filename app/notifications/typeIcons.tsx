/**
 * Type icons for the notification centre.
 *
 * Extracted from page.tsx so that NotificationSender and the page share ONE
 * definition. Two copies of this map would drift, and the thing that would
 * drift is which notifications look like Tribe itself is speaking -- which is
 * the exact property the S3 hotfix turns on.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THESE ARE THE "OFFICIAL" LOOK. ONLY AN ACTOR-LESS NOTIFICATION MAY USE ONE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A type icon in the avatar slot reads as a system message: no person, just
 * Tribe's own mark. So the rule enforced in NotificationSender is that a
 * notification with ANY actor_id renders that person, never one of these.
 * See the header of NotificationSender.tsx for why keying on actor_id rather
 * than on the joined actor object is load-bearing.
 */
import { Bell, Calendar, MessageCircle, Users, Star, Gift, Zap, UserCog, Repeat } from 'lucide-react';

export const TYPE_ICONS: Record<string, React.ReactNode> = {
  session_reminder: <Calendar className="w-5 h-5 text-tribe-green" />,
  session_update: <Calendar className="w-5 h-5 text-blue-400" />,
  series_occurrences_generated: <Repeat className="w-5 h-5 text-tribe-green" />,
  session_join: <Users className="w-5 h-5 text-tribe-green" />,
  session_invite: <Users className="w-5 h-5 text-tribe-green" />,
  new_message: <MessageCircle className="w-5 h-5 text-tribe-green" />,
  dm: <MessageCircle className="w-5 h-5 text-tribe-green" />,
  connection_request: <Users className="w-5 h-5 text-amber-500" />,
  follow: <Users className="w-5 h-5 text-amber-500" />,
  review: <Star className="w-5 h-5 text-yellow-500" />,
  review_received: <Star className="w-5 h-5 text-yellow-500" />,
  referral_complete: <Gift className="w-5 h-5 text-amber-500" />,
  referral_converted: <Gift className="w-5 h-5 text-amber-500" />,
  streak_milestone: <Zap className="w-5 h-5 text-amber-500" />,
  achievement: <Zap className="w-5 h-5 text-amber-500" />,
  profile_incomplete: <UserCog className="w-5 h-5 text-tribe-green" />,
  general: <Bell className="w-5 h-5 text-stone-400" />,
};
