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
import { Button } from '@/components/ui/button';
import type { Connection } from '@/lib/dal/connections';

interface ConnectionButtonProps {
  currentUserId: string;
  profileUserId: string;
  language: string;
  onConnect?: () => void;
}

type ConnectionStatus = 'none' | 'pending_sent' | 'pending_received' | 'connected' | 'no_shared_session';

export default function ConnectionButton({ currentUserId, profileUserId, language, onConnect }: ConnectionButtonProps) {
  const supabase = createClient();

  const [status, setStatus] = useState<ConnectionStatus>('none');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  // Check connection status and shared session
  useEffect(() => {
    const check = async () => {
      setLoading(true);

      // Check if they've shared a session
      const sharedResult = await hasSharedSession(supabase, currentUserId, profileUserId);

      if (!sharedResult.success || !sharedResult.data) {
        setStatus('no_shared_session');
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

  // a) No shared session
  if (status === 'no_shared_session') {
    return (
      <Button
        disabled
        className="w-full bg-stone-300 dark:bg-[#52575D] text-stone-600 dark:text-gray-400 cursor-not-allowed"
      >
        <Lock className="w-4 h-4 mr-2" />
        <div className="text-left">
          <div>{t('connect')}</div>
          <div className="text-xs">{t('trainTogether')}</div>
        </div>
      </Button>
    );
  }

  // b) Shared session but not connected
  if (status === 'none') {
    return (
      <Button
        onClick={handleConnect}
        disabled={actionLoading}
        className="w-full bg-[#A3E635] text-stone-900 hover:bg-[#8fd61d] font-semibold"
      >
        {actionLoading ? '...' : t('connect')}
      </Button>
    );
  }

  // c) Pending sent
  if (status === 'pending_sent') {
    return (
      <Button disabled className="w-full bg-amber-500 dark:bg-amber-600 text-white font-semibold">
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
          className="w-full bg-[#A3E635] text-stone-900 hover:bg-[#8fd61d] font-semibold"
        >
          {actionLoading ? '...' : t('accept')}
        </Button>
        <Button
          onClick={handleDecline}
          disabled={actionLoading}
          variant="outline"
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
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold">
            <MessageCircle className="w-4 h-4 mr-2" />
            {t('message')}
          </Button>
        </Link>
      </div>
    );
  }

  return null;
}
