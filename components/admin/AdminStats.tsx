import { Users, Calendar, MessageSquare, TrendingUp, Activity, Award, BarChart3 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface AdminStatsProps {
  stats: {
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
  };
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-tribe-surface rounded p-3 shadow">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-stone-600">{label}</p>
        {icon}
      </div>
      <p className="text-lg font-bold text-tribe-dark">{value}</p>
    </div>
  );
}

export default function AdminStats({ stats }: AdminStatsProps) {
  const { language } = useLanguage();

  return (
    <div className="space-y-4">
      {/* Row 1: Core Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label={language === 'es' ? 'Usuarios' : 'Users'}
          value={stats.totalUsers}
          icon={<Users className="w-4 h-4 text-blue-500" />}
        />
        <StatCard
          label={language === 'es' ? 'Usuarios Activos' : 'Active Users'}
          value={stats.activeUsers}
          icon={<Activity className="w-4 h-4 text-green-500" />}
        />
        <StatCard
          label={language === 'es' ? 'Sesiones Activas' : 'Active Sessions'}
          value={stats.activeSessions}
          icon={<Calendar className="w-4 h-4 text-green-500" />}
        />
        <StatCard
          label={language === 'es' ? 'Mensajes' : 'Messages'}
          value={stats.totalMessages}
          icon={<MessageSquare className="w-4 h-4 text-purple-500" />}
        />
      </div>

      {/* Row 2: Activity */}
      <div>
        <h3 className="text-xs font-bold text-stone-700 dark:text-gray-300 mb-2 uppercase">
          {language === 'es' ? 'Actividad' : 'Activity'}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label={language === 'es' ? 'Nuevos Hoy' : 'New Today'}
            value={stats.newUsersToday}
            icon={<TrendingUp className="w-4 h-4 text-orange-500" />}
          />
          <StatCard
            label={language === 'es' ? 'Esta Semana' : 'This Week'}
            value={stats.sessionsThisWeek}
            icon={<Calendar className="w-4 h-4 text-blue-500" />}
          />
          <StatCard
            label={language === 'es' ? 'Este Mes' : 'This Month'}
            value={stats.sessionsThisMonth}
            icon={<Calendar className="w-4 h-4 text-indigo-500" />}
          />
          <StatCard
            label={language === 'es' ? 'Prom/Usuario' : 'Avg/User'}
            value={stats.avgSessionsPerUser}
            icon={<BarChart3 className="w-4 h-4 text-teal-500" />}
          />
        </div>
      </div>

      {/* Row 3: Session Analytics */}
      <div>
        <h3 className="text-xs font-bold text-stone-700 dark:text-gray-300 mb-2 uppercase">
          {language === 'es' ? 'Analisis de Sesiones' : 'Session Analytics'}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label={language === 'es' ? 'Total Sesiones' : 'Total Sessions'}
            value={stats.totalSessions}
            icon={<Calendar className="w-4 h-4 text-stone-500" />}
          />
          <StatCard
            label={language === 'es' ? 'Completadas' : 'Completed'}
            value={stats.completedSessions}
            icon={<span className="text-green-500 text-sm">&#10003;</span>}
          />
          <StatCard
            label={language === 'es' ? 'Canceladas' : 'Cancelled'}
            value={stats.cancelledSessions}
            icon={<span className="text-red-500 text-sm">&#10007;</span>}
          />
          <StatCard
            label={language === 'es' ? 'Prom Atletas' : 'Avg Athletes'}
            value={stats.averageParticipants}
            icon={<Users className="w-4 h-4 text-blue-500" />}
          />
        </div>
      </div>

      {/* Row 4: Engagement */}
      <div>
        <h3 className="text-xs font-bold text-stone-700 dark:text-gray-300 mb-2 uppercase">
          {language === 'es' ? 'Compromiso' : 'Engagement'}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            label={language === 'es' ? 'Deporte Top' : 'Top Sport'}
            value={stats.topSport ? `${stats.topSport} (${stats.topSportCount})` : '-'}
            icon={<Award className="w-4 h-4 text-yellow-500" />}
          />
          <StatCard
            label={language === 'es' ? 'Retencion' : 'Retention'}
            value={`${stats.retentionPercent}%`}
            icon={<TrendingUp className="w-4 h-4 text-green-500" />}
          />
          <StatCard
            label={language === 'es' ? 'Sesiones Creadas' : 'Sessions Created'}
            value={stats.totalCreated}
            icon={<Calendar className="w-4 h-4 text-blue-500" />}
          />
          <StatCard
            label={language === 'es' ? 'Sesiones Unidas' : 'Sessions Joined'}
            value={stats.totalJoined}
            icon={<Users className="w-4 h-4 text-purple-500" />}
          />
        </div>
      </div>
    </div>
  );
}
