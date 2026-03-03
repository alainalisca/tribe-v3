import { Calendar } from 'lucide-react';
import type { Database } from '@/lib/database.types';

type SessionRow = Database['public']['Tables']['sessions']['Row'];
type AdminSession = SessionRow & {
  creator: { id: string; name: string | null; email: string } | null;
};

interface SessionManagementProps {
  sessions: AdminSession[];
  loading: boolean;
  language: string;
  onVerify: (sessionId: string) => void;
  onUnverify: (sessionId: string) => void;
}

export default function SessionManagement({
  sessions,
  loading,
  language,
  onVerify,
  onUnverify,
}: SessionManagementProps) {
  return (
    <div className="bg-white rounded shadow">
      <div className="p-3 border-b">
        <h3 className="text-sm font-bold text-[#272D34]">Sessions Management ({sessions.length})</h3>
        <p className="text-xs text-stone-600 mt-1">Verify location photos to reduce fake sessions</p>
      </div>

      {loading ? (
        <p className="text-center py-6 text-sm text-gray-500">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <div className="p-6 text-center">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No sessions yet</p>
        </div>
      ) : (
        <div className="divide-y max-h-[600px] overflow-y-auto">
          {sessions
            .filter((s) => s.photos && s.photos.length > 0)
            .map((session) => (
              <div key={session.id} className="p-3 hover:bg-stone-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-[#272D34]">
                        {session.sport} @ {session.location}
                      </p>
                      {session.photo_verified && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded flex items-center gap-1">
                          &#10003; Verified
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-stone-500 mb-2">
                      <span>{session.creator?.name || 'Unknown Host'}</span>
                      <span>&bull;</span>
                      <span>
                        {new Date(session.date + 'T00:00:00').toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}
                      </span>
                      <span>&bull;</span>
                      <span>{session.photos?.length || 0} photos</span>
                    </div>

                    {session.photos && session.photos.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto">
                        {session.photos.slice(0, 3).map((photo: string, idx: number) => (
                          <img
                            key={idx}
                            loading="lazy"
                            src={photo}
                            alt={`Photo ${idx + 1}`}
                            className="w-16 h-16 object-cover rounded border border-stone-200"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {!session.photo_verified ? (
                      <button
                        onClick={() => onVerify(session.id)}
                        className="px-3 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                      >
                        &#10003; Verify
                      </button>
                    ) : (
                      <button
                        onClick={() => onUnverify(session.id)}
                        className="px-3 py-1.5 bg-orange-500 text-white text-xs rounded hover:bg-orange-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
