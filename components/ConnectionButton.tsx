'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock, MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  getConnectionStatus,
  sendConnectionRequest,
  acceptConnection,
  declineConnection,
  hasSharedSession,
} from '@/lib/dal/connections';
import { fetchUpcomingSessionsByUser } from '@/lib/dal/sessions';
import { Button } from '@/components/ui/button';

interface UpcomingSession {
  id: string;
  sport: string;
  date: string;
  start_time: string;
  location: string;
}

interface ConnectionButtonProps {
  currentUserId: string;
  profileUserId: string;
  language: string;
  profileUserName?: string;
  onConnect?: () => void;
}

type ConnectionStatus = 'none' | 'pending_sent' | 'pending_received' | 'connected' | 'no_shared_session';

export default function ConnectionButton({
  currentUserId,
  profileUserId,
  language,
  profileUserName,
  onConnect,
}: ConnectionButtonProps) {
  const supabase = createClient();

  const [status, setStatus] = useState<ConnectionStatus>('none');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);

  // Check connection status and shared session
  useEffect(() => {
    const check = async () => {
      setLoading(true);

      // Check if they've shared a session
      const sharedResult = await hasSharedSession(supabase, currentUserId, profileUserId);

      if (!sharedResult.success || !sharedResult.data) {
        setStatus('no_shared_session');

        // Fetch upcoming sessions to show as a funnel
        const sessionsResult = await fetchUpcomingSessionsByUser(supabase, profileUserId);
        if (sessionsResult.success && sessionsResult.data) {
          setUpcomingSessions(sessionsResult.data);
        }

        setLoading(false);
        return;
      }

      // Get connection status
      const statusResult = await getConnectionStatus(supabase, currentUserId, profileUserId);

      if (statusResult.success) {
        setStatus(statusResult.data ?? 'none');

        // If pending or connected, fetch the connection ID
        if (statusResult.data !== 'none') {
          const { data: conn } = await supabase
            .from('connections')
            .select('id')
            .or(
              `and(requester_id.eq.${currentUserId},recipient_id.eq.${profileUserId}),and(requester_id.eq.${profileUserId},recipient_id.eq.${currentUserId})`
            )
            .single();

          if (conn) {
            setConnectionId((conn as Record<string, unknown>).id as string);
          }
        }
      } else {
        setError(statusResult.error || null);
      }

      setLoading(false);
    };

    if (currentUserId !== profileUserId) {
      check();
    }
  }, [supabase, currentUserId, profileUserId]);

  const handleConnect = async () => {
    setActionLoading(true);
    setError(null);

    const result = await sendConnectionRequest(supabase, currentUserId, profileUserId);

    if (result.success) {
      setStatus('pending_sent');
      setConnectionId(result.data ?? null);
      onConnect?.();
    } else {
      setError(result.error || null);
    }

    setActionLoading(false);
  };

  const handleAccept = async () => {
    if (!connectionId) return;

    setActionLoading(true);
    setError(null);

    const result = await acceptConnection(supabase, connectionId);

    if (result.success) {
      setStatus('connected');
      onConnect?.();
    } else {
      setError(result.error || null);
    }

    setActionLoading(false);
  };

  const handleDecline = async () => {
    if (!connectionId) return;

    setActionLoading(true);
    setError(null);

    const result = await declineConnection(supabase, connectionId);

    if (result.success) {
      setStatus('none');
      setConnectionId(null);
    } else {
      setError(result.error || null);
    }

    setActionLoading(false);
  };

  const t = (key: string): string => {
    const translations: Record<string, Record<string, string>> = {
      connect: {
        en: 'Connect',
        es: 'Conectar',
      },
      trainTogether: {
        en: 'Train together first to unlock',
        es: 'Entrena juntos primero para desbloquear',
      },
      requestSent: {
        en: 'Request Sent',
        es: 'Solicitud Enviada',
      },
      accept: {
        en: 'Accept',
        es: 'Aceptar',
      },
      decline: {
        en: 'Decline',
        es: 'Rechazar',
      },
      connected: {
        en: 'Connected',
        es: 'Conectado',
      },
      message: {
        en: 'Message',
        es: 'Mensaje',
      },
      joinSessionTitle: {
        en: 'Join a session with {name} to connect',
        es: 'Únete a una sesión con {name} para conectar',
      },
      connectionsUnlock: {
        en: 'Connections unlock after training together',
        es: 'Las conexiones se desbloquean después de entrenar juntos',
      },
      viewSessions: {
        en: 'View their sessions',
        es: 'Ver sus sesiones',
      },
      noUpcomingSessions: {
        en: 'No upcoming sessions yet',
        es: 'No hay sesiones próximas aún',
      },
    };

    return translations[key]?.[language] || key;
  };

  if (loading) {
    return (
      <Button disabled className="w-full">
        {t('connect')}
      </Button>
    );
  }

  // a) No shared session — funnel toward training together
  if (status === 'no_shared_session') {
    const displayName = profileUserName || t('connect');
    const title = t('joinSessionTitle').replace('{name}', displayName);

    return (
      <div className="bg-stone-100 dark:bg-[#3D4349] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-4 h-4 text-stone-500 dark:text-gray-400" aria-hidden="true" />
          <p className="text-sm font-semibold text-stone-800 dark:text-gray-200">{title}</p>
        </div>
        <p className="text-xs text-stone-500 dark:text-gray-400 mb-3">{t('connectionsUnlock')}</p>

        {upcomingSessions.length > 0 ? (
          <Link href={`/profile/${profileUserId}#sessions`}>
            <Button className="w-full bg-[#A3E635] text-stone-900 hover:bg-[#8fd61d] font-semibold">
              {t('viewSessions')}
            </Button>
          </Link>
        ) : (
          <p className="text-xs text-stone-400 dark:text-gray-500 text-center">{t('noUpcomingSessions')}</p>
        )}
      </div>
    );
  }

  // b) Shared session but not connected
  if (status === 'none') {
    return (
      <Button
        onClick={handleConnect}
        disabled={actionLoading}
        aria-label={t('connect')}
        className="w-full bg-[#A3E635] text-stone-900 hover:bg-[#8fd61d] font-semibold"
      >
        {actionLoading ? '...' : t('connect')}
      </Button>
    );
  }

  // c) Pending sent
  if (status === 'pending_sent') {
    return (
      <Button
        disabled
        aria-label={t('requestSent')}
        className="w-full bg-amber-500 dark:bg-amber-600 text-white font-semibold"
      >
        {t('requestSent')}
      </Button>
    );
  }

  // d) Pending received
  if (status === 'pending_received') {
    return (
      <div className="space-y-2">
        <Button
          onClick={handleAccept}
          disabled={actionLoading}
          aria-label={t('accept')}
          className="w-full bg-[#A3E635] text-stone-900 hover:bg-[#8fd61d] font-semibold"
        >
          {actionLoading ? '...' : t('accept')}
        </Button>
        <Button
          onClick={handleDecline}
          disabled={actionLoading}
          variant="outline"
          aria-label={t('decline')}
          className="w-full text-stone-600 dark:text-gray-400"
        >
          {t('decline')}
        </Button>
      </div>
    );
  }

  // e) Connected
  if (status === 'connected') {
    return (
      <div className="space-y-2">
        <Button
          disabled
          className="w-full bg-stone-200 dark:bg-[#52575D] text-stone-700 dark:text-gray-300 font-semibold"
        >
          {t('connected')} ✓
        </Button>
        <Link href={`/messages?user=${profileUserId}`}>
          <Button aria-label={t('message')} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold">
            <MessageCircle className="w-4 h-4 mr-2" aria-hidden="true" />
            {t('message')}
          </Button>
        </Link>
      </div>
    );
  }

  return null;
}
