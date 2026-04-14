import { Bug } from 'lucide-react';
import type { Database } from '@/lib/database.types';

type BugReportRow = Database['public']['Tables']['bug_reports']['Row'];
type AdminBug = BugReportRow & {
  user: { id: string; name: string | null; email: string } | null;
};

interface BugReportsProps {
  bugs: AdminBug[];
  loading: boolean;
  language: string;
  onUpdateStatus: (bugId: string, status: string) => void;
}

export default function BugReports({ bugs, loading, language, onUpdateStatus }: BugReportsProps) {
  const pendingBugs = bugs.filter((b) => b.status === 'pending');
  const resolvedBugs = bugs.filter((b) => b.status !== 'pending');

  if (loading) {
    return (
      <p className="text-center py-6 text-sm text-gray-500">
        {language === 'es' ? 'Cargando errores...' : 'Loading bugs...'}
      </p>
    );
  }

  if (bugs.length === 0) {
    return (
      <div className="bg-white dark:bg-tribe-surface rounded p-6 text-center shadow">
        <Bug className="w-12 h-12 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">
          {language === 'es' ? 'Sin reportes de errores aun' : 'No bug reports yet'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendingBugs.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-tribe-dark flex items-center gap-2">
            <Bug className="w-4 h-4 text-orange-500" />
            {language === 'es' ? 'Errores Abiertos' : 'Open Bugs'} ({pendingBugs.length})
          </h3>
          {pendingBugs.map((bug) => (
            <div key={bug.id} className="bg-white dark:bg-tribe-surface rounded shadow p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="text-sm font-bold text-tribe-dark">{bug.title}</p>
                  <p className="text-xs text-stone-600">{bug.user?.email}</p>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded ${
                    bug.severity === 'critical'
                      ? 'bg-red-100 text-red-800'
                      : bug.severity === 'high'
                        ? 'bg-orange-100 text-orange-800'
                        : bug.severity === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-stone-100 text-gray-800'
                  }`}
                >
                  {bug.severity}
                </span>
              </div>

              <p className="text-xs text-stone-700 dark:text-gray-300 mb-1 p-2 bg-stone-50 dark:bg-tribe-dark rounded">
                {bug.description}
              </p>

              {bug.steps_to_reproduce && (
                <p className="text-xs text-stone-600 mb-2 p-2 bg-blue-50 rounded whitespace-pre-wrap">
                  <strong>{language === 'es' ? 'Pasos:' : 'Steps:'}</strong> {bug.steps_to_reproduce}
                </p>
              )}

              <div className="text-xs text-stone-500 mb-3">
                {new Date(bug.created_at ?? '').toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onUpdateStatus(bug.id, 'investigating')}
                  className="flex-1 py-1.5 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600"
                >
                  {language === 'es' ? 'Investigando' : 'Investigating'}
                </button>
                <button
                  onClick={() => onUpdateStatus(bug.id, 'fixed')}
                  className="flex-1 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                >
                  {language === 'es' ? 'Corregido' : 'Fixed'}
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {resolvedBugs.slice(0, 5).map((bug) => (
        <div key={bug.id} className="bg-stone-50 dark:bg-tribe-dark rounded p-3 opacity-60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{bug.title}</p>
              <p className="text-xs text-stone-600">{bug.user?.name}</p>
            </div>
            <span className="text-xs text-green-600">
              {bug.status === 'fixed'
                ? language === 'es'
                  ? '&#10003; Corregido'
                  : '&#10003; Fixed'
                : language === 'es'
                  ? 'Investigando'
                  : 'Investigating'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
