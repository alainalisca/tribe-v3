/** Shared return type for all DAL functions */
export interface DalResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Joined query shapes (used by DAL functions that join across tables) ---

/** Participant row with nested user profile (from session_participants + users join) */
export interface ParticipantWithUser {
  user_id: string;
  status?: string;
  is_guest?: boolean | null;
  guest_name?: string | null;
  user: { id: string; name: string; avatar_url: string | null } | null;
}

/** Participant with user details for cron/reminders */
export interface ParticipantWithUserDetails {
  user_id: string;
  user: {
    id: string;
    preferred_language: string | null;
    session_reminders_enabled: boolean | null;
  } | null;
}

/** Participation row with joined session data (for weekly recap) */
export interface ParticipationWithSession {
  session_id: string;
  sessions: { date: string; sport: string; duration: number | null } | null;
}

/** Session with creator join (for cron/reminders) */
export interface SessionWithCreator {
  id: string;
  sport: string;
  location: string;
  date: string;
  start_time: string;
  duration: number;
  description: string | null;
  status: string;
  followup_sent?: boolean;
  reminder_sent?: boolean;
  creator: {
    id: string;
    name: string;
    email: string;
    preferred_language: string | null;
  } | null;
}

/** Live user with details (from live_status + users join) */
export interface LiveUserWithDetails {
  user_id: string;
  started_at: string | null;
  user: { name: string; avatar_url: string | null } | null;
}

/** Pending participant with user info (for join-request views) */
export interface PendingParticipantWithUser {
  id: string;
  user_id: string;
  session_id: string;
  joined_at: string | null;
  status: string;
  user: { id: string; name: string; avatar_url: string | null } | null;
}

/** Story with user and session join */
export interface StoryWithDetails {
  id: string;
  session_id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  thumbnail_url: string | null;
  caption: string | null;
  created_at: string;
  user: { name: string; avatar_url: string | null } | null;
  session?: { sport: string } | null;
}

/** Chat message with user join */
export interface ChatMessageWithUser {
  session_id: string;
  message: string;
  created_at: string;
  user: { name: string } | null;
}

/** Joined session details (from participant + session join) */
export interface JoinedSessionWithDetails {
  session_id: string;
  sessions: {
    id: string;
    sport: string;
    date: string;
    start_time: string;
    location: string;
    status: string;
  };
}

/** User with notification fields */
export interface UserForNotification {
  id: string;
  push_subscription: string | null;
  preferred_language: string | null;
  fcm_token: string | null;
  fcm_platform: string | null;
}
