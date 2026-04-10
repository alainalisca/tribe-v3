'use client';

import { useState } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { sendConnectionRequest } from '@/lib/dal/connections';
import { Button } from '@/components/ui/button';
import { sportTranslations } from '@/lib/translations';

export interface Participant {
  id: string;
  name: string;
  avatar_url: string | null;
  sports: string[];
}

interface PostSessionConnectProps {
  sessionId: string;
  currentUserId: string;
  participants: Participant[];
  language: string;
  onConnectionSent?: (participantId: string) => void;
}

export default function PostSessionConnect({
  sessionId,
  currentUserId,
  participants,
  language,
  onConnectionSent,
}: PostSessionConnectProps) {
  const supabase = createClient();
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Filter out current user
  const otherParticipants = participants.filter((p) => p.id !== currentUserId);

  const handleConnect = async (participantId: string) => {
    setSendingIds((prev) => new Set(prev).add(participantId));
    setError(null);

    const result = await sendConnectionRequest(supabase, currentUserId, participantId);

    setSendingIds((prev) => {
      const next = new Set(prev);
      next.delete(participantId);
      return next;
    });

    if (result.success) {
      setSentIds((prev) => new Set(prev).add(participantId));
      onConnectionSent?.(participantId);
    } else {
      // Don't show error for "already connected" case
      if (!result.error?.includes('already exists')) {
        setError(result.error || 'Failed to send connection request');
      }
    }
  };

  const t = (key: string): string => {
    const translations: Record<string, Record<string, string>> = {
      connectWithTrainingPartners: {
        en: 'Connect with Training Partners',
        es: 'Conectar con Compañeros de Entrenamiento',
      },
      subtitle: {
        en: "Connecting lets you message each other and see each other's sessions",
        es: 'Conectar te permite mensajearte y ver las sesiones de otros',
      },
      connect: {
        en: 'Connect',
        es: 'Conectar',
      },
      requestSent: {
        en: 'Request Sent',
        es: 'Solicitud Enviada',
      },
      noOtherParticipants: {
        en: 'No other athletes to connect with',
        es: 'Sin otros atletas para conectar',
      },
    };

    return translations[key]?.[language] || key;
  };

  if (otherParticipants.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="font-bold text-stone-900 dark:text-white">{t('connectWithTrainingPartners')}</h3>
        <p className="text-sm text-stone-600 dark:text-gray-400">{t('subtitle')}</p>
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100 text-sm rounded-lg">{error}</div>
      )}

      <div className="space-y-2">
        {otherParticipants.map((participant) => {
          const isSending = sendingIds.has(participant.id);
          const hasSent = sentIds.has(participant.id);
          const primarySport = participant.sports[0] || 'Running';

          return (
            <div key={participant.id} className="flex items-center gap-3 p-3 bg-stone-100 dark:bg-[#3D4349] rounded-lg">
              {/* Avatar */}
              <div className="relative w-10 h-10 flex-shrink-0">
                {participant.avatar_url ? (
                  <Image
                    src={participant.avatar_url}
                    alt={participant.name}
                    fill
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <div className="w-full h-full bg-[#A3E635] rounded-full flex items-center justify-center text-xs font-bold text-stone-900">
                    {participant.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-stone-900 dark:text-white text-sm line-clamp-1">{participant.name}</p>
                <p className="text-xs text-stone-600 dark:text-gray-400">
                  {sportTranslations[primarySport]?.[language as 'en' | 'es'] || primarySport}
                </p>
              </div>

              {/* Button */}
              <Button
                onClick={() => handleConnect(participant.id)}
                disabled={isSending || hasSent}
                className={`text-xs font-semibold px-3 py-1 h-auto flex-shrink-0 ${
                  hasSent
                    ? 'bg-stone-300 dark:bg-[#52575D] text-stone-600 dark:text-gray-400'
                    : 'bg-[#A3E635] text-stone-900 hover:bg-[#8fd61d]'
                }`}
              >
                {isSending ? '...' : hasSent ? t('requestSent') : t('connect')}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
