'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';

interface Request {
  id: string;
  session_id: string;
  user_id: string;
  status: string;
  joined_at: string;
  session: {
    sport: string;
    date: string;
    start_time: string;
    location: string;
  };
  user: {
    full_name: string;
    avatar_url: string | null;
  };
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadRequests();
    
    const channel = supabase
      .channel('requests-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_participants',
          filter: 'status=eq.pending',
        },
        () => {
          loadRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadRequests = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: userSessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id')
        .eq('creator_id', user.id);

      if (sessionsError) {
        console.error('Error loading user sessions:', sessionsError);
        setLoading(false);
        return;
      }

      if (!userSessions || userSessions.length === 0) {
        setRequests([]);
        setLoading(false);
        return;
      }

      const sessionIds = userSessions.map(s => s.id);

      const { data: pendingRequests, error: requestsError } = await supabase
        .from('session_participants')
        .select('id, session_id, user_id, status, joined_at')
        .in('session_id', sessionIds)
        .eq('status', 'pending')
        .order('joined_at', { ascending: false });

      if (requestsError) {
        console.error('Error loading requests:', requestsError);
        setLoading(false);
        return;
      }

      if (!pendingRequests || pendingRequests.length === 0) {
        setRequests([]);
        setLoading(false);
        return;
      }

      const uniqueSessionIds = [...new Set(pendingRequests.map(r => r.session_id))];
      const { data: sessionDetails } = await supabase
        .from('sessions')
        .select('id, sport, date, start_time, location')
        .in('id', uniqueSessionIds);

      const uniqueUserIds = [...new Set(pendingRequests.map(r => r.user_id))];
      const { data: userProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', uniqueUserIds);

      const formattedRequests: Request[] = pendingRequests.map(request => {
        const session = sessionDetails?.find(s => s.id === request.session_id);
        const profile = userProfiles?.find(p => p.id === request.user_id);

        return {
          id: request.id,
          session_id: request.session_id,
          user_id: request.user_id,
          status: request.status,
          joined_at: request.joined_at,
          session: {
            sport: session?.sport || 'Unknown',
            date: session?.date || '',
            start_time: session?.start_time || '',
            location: session?.location || 'Unknown location',
          },
          user: {
            full_name: profile?.full_name || 'Unknown User',
            avatar_url: profile?.avatar_url || null,
          },
        };
      });

      setRequests(formattedRequests);
    } catch (error) {
      console.error('Error in loadRequests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async (requestId: string, action: 'accepted' | 'rejected') => {
    try {
      const { error } = await supabase
        .from('session_participants')
        .update({ status: action })
        .eq('id', requestId);

      if (error) {
        console.error(`Error ${action} request:`, error);
        alert(`Error al ${action === 'accepted' ? 'aceptar' : 'rechazar'} la solicitud`);
        return;
      }

      setRequests(prev => prev.filter(r => r.id !== requestId));
      
      const message = action === 'accepted' ? '✅ Solicitud aceptada' : '❌ Solicitud rechazada';
      alert(message);
    } catch (error) {
      console.error('Error handling request:', error);
      alert('Error al procesar la solicitud');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center pb-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#9EE551] mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando solicitudes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] pb-24">
      <div className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-[#272D34]">Solicitudes</h1>
          <p className="text-sm text-stone-600 mt-1">
            Gestiona las solicitudes para unirse a tus sesiones
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {requests.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
            <p className="text-stone-600 text-lg font-medium mb-2">No hay solicitudes pendientes</p>
            <p className="text-sm text-stone-500 mb-6">
              Cuando alguien solicite unirse a tus sesiones, aparecerán aquí
            </p>
            <Link
              href="/"
              className="inline-block px-6 py-2.5 bg-[#9EE551] text-[#272D34] font-semibold rounded-lg hover:bg-[#8FD642] transition-colors"
            >
              Ver sesiones disponibles
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <div
                key={request.id}
                className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-[#9EE551] transition"
              >
                <div className="flex items-center gap-3 mb-3">
                  {request.user.avatar_url ? (
                    <img
                      src={request.user.avatar_url}
                      alt={request.user.full_name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#9EE551] to-[#8FD642] flex items-center justify-center">
                      <span className="text-[#272D34] text-lg font-bold">
                        {request.user.full_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1">
                    <Link
                      href={`/profile/${request.user_id}`}
                      className="font-semibold text-[#272D34] hover:text-[#9EE551] text-sm"
                    >
                      {request.user.full_name}
                    </Link>
                    <p className="text-xs text-stone-600">
                      Solicitó unirse • {new Date(request.joined_at).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                </div>

                <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 mb-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="font-semibold text-[#272D34] text-sm mb-1">{request.session.sport}</p>
                      <p className="text-xs text-stone-600">
                        📅 {new Date(request.session.date).toLocaleDateString('es-ES', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })} • {request.session.start_time}
                      </p>
                      <p className="text-xs text-stone-600 mt-1">
                        📍 {request.session.location}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleRequest(request.id, 'accepted')}
                    className="flex-1 px-4 py-2 bg-[#9EE551] text-[#272D34] rounded-lg hover:bg-[#8FD642] transition-colors font-semibold text-sm"
                  >
                    Aceptar
                  </button>
                  <button
                    onClick={() => handleRequest(request.id, 'rejected')}
                    className="flex-1 px-4 py-2 bg-stone-200 text-stone-700 rounded-lg hover:bg-stone-300 transition-colors font-medium text-sm"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
