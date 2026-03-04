import { useRouter } from 'next/navigation';
import { Flag, AlertTriangle } from 'lucide-react';
import type { Database } from '@/lib/database.types';

type ReportedUserRow = Database['public']['Tables']['reported_users']['Row'];
type AdminReport = ReportedUserRow & {
  reporter: { id: string; name: string | null; email: string } | null;
  reported: { id: string; name: string | null; email: string } | null;
};

interface ReportedMessagesProps {
  reports: AdminReport[];
  loading: boolean;
  language: string;
  onBanUser: (userId: string) => void;
  onUpdateStatus: (reportId: string, status: string) => void;
}

export default function ReportedMessages({
  reports,
  loading,
  language,
  onBanUser,
  onUpdateStatus,
}: ReportedMessagesProps) {
  const router = useRouter();
  const pendingReports = reports.filter((r) => r.status === 'pending');
  const resolvedReports = reports.filter((r) => r.status !== 'pending');

  if (loading) {
    return (
      <p className="text-center py-6 text-sm text-gray-500">
        {language === 'es' ? 'Cargando reportes...' : 'Loading reports...'}
      </p>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="bg-white rounded p-6 text-center shadow">
        <Flag className="w-12 h-12 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">{language === 'es' ? 'Sin reportes aun' : 'No reports yet'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendingReports.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-[#272D34] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            {language === 'es' ? 'Pendiente' : 'Pending'} ({pendingReports.length})
          </h3>
          {pendingReports.map((report) => (
            <div key={report.id} className="bg-white rounded shadow p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#272D34]">{report.reported?.name}</p>
                  <p className="text-xs text-stone-600">{report.reported?.email}</p>
                </div>
                <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">{report.reason}</span>
              </div>

              {report.description && (
                <p className="text-xs text-stone-700 mb-2 p-2 bg-stone-50 rounded">{report.description}</p>
              )}

              <div className="flex items-center justify-between text-xs text-stone-500 mb-3">
                <span>By: {report.reporter?.name}</span>
                <span>
                  {new Date(report.created_at ?? '').toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/profile/${report.reported_user_id}`)}
                  className="flex-1 py-1.5 border border-stone-300 text-stone-700 text-xs rounded hover:bg-stone-50"
                >
                  {language === 'es' ? 'Ver Perfil' : 'View Profile'}
                </button>
                <button
                  onClick={() => onBanUser(report.reported_user_id ?? '')}
                  className="flex-1 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                >
                  {language === 'es' ? 'Banear Usuario' : 'Ban User'}
                </button>
                <button
                  onClick={() => onUpdateStatus(report.id, 'resolved')}
                  className="flex-1 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                >
                  {language === 'es' ? 'Resolver' : 'Resolve'}
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {resolvedReports.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-[#272D34] mt-4">
            {language === 'es' ? 'Resuelto' : 'Resolved'} ({resolvedReports.length})
          </h3>
          {resolvedReports.slice(0, 5).map((report) => (
            <div key={report.id} className="bg-stone-50 rounded p-3 opacity-60">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{report.reported?.name}</p>
                  <p className="text-xs text-stone-600">{report.reason}</p>
                </div>
                <span className="text-xs text-green-600">&#10003; {language === 'es' ? 'Resuelto' : 'Resolved'}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
