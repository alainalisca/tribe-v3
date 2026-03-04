import type { Database } from '@/lib/database.types';

type UserRow = Database['public']['Tables']['users']['Row'];
type SessionRow = Database['public']['Tables']['sessions']['Row'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
type ReportedUserRow = Database['public']['Tables']['reported_users']['Row'];
type UserFeedbackRow = Database['public']['Tables']['user_feedback']['Row'];
type BugReportRow = Database['public']['Tables']['bug_reports']['Row'];

export type AdminUser = UserRow & { sessions_created: number; sessions_joined: number };
export type AdminReport = ReportedUserRow & {
  reporter: { id: string; name: string | null; email: string } | null;
  reported: { id: string; name: string | null; email: string } | null;
};
export type AdminFeedback = UserFeedbackRow & {
  user: { id: string; name: string | null; email: string } | null;
};
export type AdminBug = BugReportRow & {
  user: { id: string; name: string | null; email: string } | null;
};
export type AdminSession = SessionRow & {
  creator: { id: string; name: string | null; email: string } | null;
};
export type AdminMessage = ChatMessageRow & {
  user: { id: string; name: string | null; email: string } | null;
  session: { id: string; sport: string; location: string } | null;
};

export interface AdminStatsData {
  totalUsers: number;
  activeUsers: number;
  activeSessions: number;
  totalSessions: number;
  sessionsThisWeek: number;
  sessionsThisMonth: number;
  totalMessages: number;
  newUsersToday: number;
  completedSessions: number;
  cancelledSessions: number;
  averageParticipants: number;
  topSport: string;
  topSportCount: number;
  avgSessionsPerUser: number;
  retentionPercent: number;
  totalCreated: number;
  totalJoined: number;
}
