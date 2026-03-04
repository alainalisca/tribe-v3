import { MessageSquare, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import type { Database } from '@/lib/database.types';

type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
type AdminMessage = ChatMessageRow & {
  user: { id: string; name: string | null; email: string } | null;
  session: { id: string; sport: string; location: string } | null;
};

interface MessageListProps {
  messages: AdminMessage[];
  loading: boolean;
  actionLoading: string | null;
  onDelete: (messageId: string) => void;
}

export default function MessageList({ messages, loading, actionLoading, onDelete }: MessageListProps) {
  const { language } = useLanguage();
  return (
    <div className="bg-white rounded shadow">
      <div className="p-3 border-b">
        <h3 className="text-sm font-bold text-[#272D34] flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-500" />
          {language === 'es' ? 'Mensajes Recientes' : 'Recent Messages'} ({messages.length})
        </h3>
        <p className="text-xs text-stone-600 mt-1">
          {language === 'es' ? 'Ultimos 100 mensajes de todas las sesiones' : 'Last 100 messages across all sessions'}
        </p>
      </div>

      {loading ? (
        <p className="text-center py-6 text-sm text-gray-500">
          {language === 'es' ? 'Cargando mensajes...' : 'Loading messages...'}
        </p>
      ) : messages.length === 0 ? (
        <div className="p-6 text-center">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">{language === 'es' ? 'Sin mensajes aun' : 'No messages yet'}</p>
        </div>
      ) : (
        <div className="divide-y max-h-[600px] overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id} className="p-3 hover:bg-stone-50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-medium text-[#272D34]">{msg.user?.name || 'Unknown User'}</p>
                    <span className="text-xs text-stone-500">{msg.user?.email}</span>
                  </div>

                  <p className="text-sm text-stone-700 mb-2 break-words">{msg.message}</p>

                  <div className="flex items-center gap-3 text-xs text-stone-500">
                    <span>
                      {language === 'es' ? 'Sesion:' : 'Session:'} {msg.session?.sport} @ {msg.session?.location}
                    </span>
                    <span>&bull;</span>
                    <span>{new Date(msg.created_at ?? '').toLocaleString()}</span>
                  </div>
                </div>

                <button
                  onClick={() => onDelete(msg.id)}
                  disabled={actionLoading === msg.id}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded disabled:opacity-50"
                  title="Delete message"
                >
                  {actionLoading === msg.id ? (
                    <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
