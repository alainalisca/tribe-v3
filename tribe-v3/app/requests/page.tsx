'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Check, X, User } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import { showSuccess, showError } from '@/lib/toast';

export default function RequestsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
      return;
    }
    setUser(user);
    loadRequests(user.id);
  }

  async function loadRequests(userId: string) {
    try {
      const { data: mySessions } = await supabase
        .from('sessions')
        .select('id, sport, date, start_time, location')
        .eq('creator_id', userId);

      if (!mySessions || mySessions.length === 0) {
        setLoading(false);
        return;
      }

      const sessionIds = mySessions.map(s => s.id);

      const { data: pendingRequests } = await supabase
        .from('session_participants')
        .select('*, users(name, avatar_url, sports)')
        .in('session_id', sessionIds)
        .eq('status', 'pending');

      const requestsWithSessions = pendingRequests?.map(req => ({
        ...req,
        session: mySessions.find(s => s.id === req.session_id)
      })) || [];

      setRequests(requestsWithSessions);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(requestId: string) {
    try {
      const { error } = await supabase
        .from('session_participants')
        .update({ status: 'confirmed' })
        .eq('id', requestId);

      if (error) throw error;

      showSuccess(language === 'en' ? 'Request accepted!' : '¡Solicitud aceptada!');
      loadRequests(user.id);
    } catch (error: any) {
      showError('Error: ' + error.message);
    }
  }

  async function handleDecline(requestId: string) {
    try {
      const { error } = await supabase
        .from('session_participants')
        .delete()
        .eq('id', requestId);

      if (error) throw error;

      showSuccess(language === 'en' ? 'Request declined' : 'Solicitud rechazada');
      loadRequests(user.id);
    } catch (error: any) {
      showError('Error: ' + error.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <p className="text-stone-900 dark:text-white">
          
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32">
      <div className="bg-stone-200 dark:bg-[#272D34] p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/">
            <button className="p-2 hover:bg-stone-300 dark:hover:bg-[#52575D] rounded-lg transition">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">
            {language === 'en' ? 'Join Requests' : 'Solicitudes'}
          </h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {requests.length === 0 ? (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-8 text-center border border-stone-200 dark:border-[#52575D]">
            <div className="text-4xl mb-4">📬</div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-2">
              {language === 'en' ? 'No Pending Requests' : 'Sin Solicitudes Pendientes'}
            </h2>
            <p className="text-stone-600 dark:text-gray-300 mb-4">
              {language === 'en'
                ? 'When someone wants to join your sessions, you\'ll see their requests here.'
                : 'Cuando alguien quiera unirse a tus sesiones, verás sus solicitudes aquí.'}
            </p>
            <Link href="/create">
              <button className="px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition">
                {language === 'en' ? 'Create a Session' : 'Crear una Sesión'}
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div 
                key={request.id}
                className="bg-white dark:bg-[#6B7178] rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-stone-900 dark:text-white">
                      {request.session.sport} - {request.session.location}
                    </h3>
                    <p className="text-sm text-stone-600 dark:text-gray-400">
                      {new Date(request.session.date).toLocaleDateString()} at {request.session.start_time}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-4 p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg">
                  {request.users?.avatar_url ? (
                    <img 
                      src={request.users.avatar_url} 
                      alt={request.users.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-stone-300 dark:bg-[#404549] rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-stone-600 dark:text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-stone-900 dark:text-white">
                      {request.users?.name}
                    </p>
                  </div>
                  <Link href={`/profile/${request.user_id}`}>
                    <button className="text-xs text-tribe-green hover:underline">
                      {language === 'en' ? 'View Profile' : 'Ver Perfil'}
                    </button>
                  </Link>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(request.id)}
                    className="flex-1 py-2 bg-tribe-green text-slate-900 font-semibold rounded-lg hover:bg-lime-500 transition flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    {language === 'en' ? 'Accept' : 'Aceptar'}
                  </button>
                  <button
                    onClick={() => handleDecline(request.id)}
                    className="flex-1 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    {language === 'en' ? 'Decline' : 'Rechazar'}
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
