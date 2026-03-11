import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Database } from '@/lib/database.types';

type UserFeedbackRow = Database['public']['Tables']['user_feedback']['Row'];
type AdminFeedback = UserFeedbackRow & {
  user: { id: string; name: string | null; email: string } | null;
};

interface FeedbackListProps {
  feedback: AdminFeedback[];
  loading: boolean;
  language: string;
  onUpdateStatus: (feedbackId: string, status: string) => void;
}

export default function FeedbackList({ feedback, loading, language, onUpdateStatus }: FeedbackListProps) {
  const pendingFeedback = feedback.filter((f) => f.status === 'pending');
  const resolvedFeedback = feedback.filter((f) => f.status !== 'pending');

  if (loading) {
    return (
      <p className="text-center py-6 text-sm text-gray-500">
        {language === 'es' ? 'Cargando comentarios...' : 'Loading feedback...'}
      </p>
    );
  }

  if (feedback.length === 0) {
    return (
      <div className="bg-white rounded p-6 text-center shadow">
        <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">{language === 'es' ? 'Sin comentarios aun' : 'No feedback yet'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendingFeedback.length > 0 && (
        <>
          <h3 className="text-sm font-bold text-[#272D34] flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-500" />
            {language === 'es' ? 'Nuevos Comentarios' : 'New Feedback'} ({pendingFeedback.length})
          </h3>
          {pendingFeedback.map((item) => (
            <div key={item.id} className="bg-white rounded shadow p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#272D34]">{item.title}</p>
                  <p className="text-xs text-stone-600">{item.user?.email}</p>
                </div>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                  {item.type === 'feature_request' ? (language === 'es' ? 'Funcion' : 'Feature') : 'General'}
                </span>
              </div>

              <p className="text-xs text-stone-700 mb-2 p-2 bg-stone-50 rounded">{item.description}</p>

              <div className="text-xs text-stone-500 mb-3">
                {new Date(item.created_at ?? '').toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => onUpdateStatus(item.id, 'reviewed')}
                  className="flex-1 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                  size="sm"
                >
                  {language === 'es' ? 'Marcar Revisado' : 'Mark Reviewed'}
                </Button>
                <Button
                  onClick={() => onUpdateStatus(item.id, 'implemented')}
                  className="flex-1 py-1.5 text-xs rounded"
                  size="sm"
                >
                  {language === 'es' ? 'Implementado' : 'Implemented'}
                </Button>
              </div>
            </div>
          ))}
        </>
      )}

      {resolvedFeedback.slice(0, 5).map((item) => (
        <div key={item.id} className="bg-stone-50 rounded p-3 opacity-60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-stone-600">{item.user?.name}</p>
            </div>
            <span className="text-xs text-green-600">
              {item.status === 'implemented'
                ? language === 'es'
                  ? '&#10003; Listo'
                  : '&#10003; Done'
                : language === 'es'
                  ? '&#10003; Revisado'
                  : '&#10003; Reviewed'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
