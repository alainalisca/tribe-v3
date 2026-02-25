import { Users, Calendar, MessageSquare, TrendingUp } from 'lucide-react';

interface AdminStatsProps {
  stats: {
    totalUsers: number;
    activeSessions: number;
    totalMessages: number;
    newUsersToday: number;
    completedSessions: number;
    cancelledSessions: number;
    averageParticipants: number;
  };
}

export default function AdminStats({ stats }: AdminStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-white rounded p-3 shadow">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-stone-600">Users</p>
          <Users className="w-4 h-4 text-blue-500" />
        </div>
        <p className="text-lg font-bold">{stats.totalUsers}</p>
      </div>
      <div className="bg-white rounded p-3 shadow">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-stone-600">Sessions</p>
          <Calendar className="w-4 h-4 text-green-500" />
        </div>
        <p className="text-lg font-bold">{stats.activeSessions}</p>
      </div>
      <div className="bg-white rounded p-3 shadow">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-stone-600">Messages</p>
          <MessageSquare className="w-4 h-4 text-purple-500" />
        </div>
        <p className="text-lg font-bold">{stats.totalMessages}</p>
      </div>
      <div className="bg-white rounded p-3 shadow">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-stone-600">New Today</p>
          <TrendingUp className="w-4 h-4 text-orange-500" />
        </div>
        <p className="text-lg font-bold">{stats.newUsersToday}</p>
      </div>

      {/* Session Analytics */}
      <div className="mt-4">
        <h3 className="text-xs font-bold text-stone-700 mb-2 uppercase">Session Analytics</h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded p-3 shadow">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-stone-600">Completed</p>
              <span className="text-green-500">&#10003;</span>
            </div>
            <p className="text-lg font-bold">{stats.completedSessions}</p>
          </div>
          <div className="bg-white rounded p-3 shadow">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-stone-600">Cancelled</p>
              <span className="text-red-500">&#10007;</span>
            </div>
            <p className="text-lg font-bold">{stats.cancelledSessions}</p>
          </div>
          <div className="bg-white rounded p-3 shadow">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-stone-600">Avg Participants</p>
              <Users className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-lg font-bold">{stats.averageParticipants}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
