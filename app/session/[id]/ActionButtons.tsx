'use client';

import Link from 'next/link';
import { LogOut, Trash2, MessageCircle } from 'lucide-react';
import { downloadICS } from '@/lib/calendar';

interface ActionButtonsProps {
  language: 'en' | 'es';
  user: { id: string } | null;
  // REASON: session shape comes from DB with many nullable fields — loosely typed here
  session: any;
  isCreator: boolean;
  hasJoined: boolean;
  isPast: boolean;
  isFull: boolean;
  sessionActions: {
    guestHasJoined: boolean;
    joining: boolean;
    handleJoin: () => void;
    handleLeave: () => void;
    handleCancel: () => void;
    handleGuestLeave: () => void;
    setShowGuestModal: (v: boolean) => void;
  };
  onEdit: () => void;
  onInvite: () => void;
  creatingInvite: boolean;
}

export default function ActionButtons({
  language,
  user,
  session,
  isCreator,
  hasJoined,
  isPast,
  isFull,
  sessionActions,
  onEdit,
  onInvite,
  creatingInvite,
}: ActionButtonsProps) {
  return (
    <div className="space-y-2">
      {!user ? (
        sessionActions.guestHasJoined ? (
          <button
            onClick={sessionActions.handleGuestLeave}
            className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            {language === 'es' ? 'Salir de Sesión' : 'Leave Session'}
          </button>
        ) : isPast ? (
          <button
            disabled
            className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed"
          >
            {language === 'es' ? 'Sesión Terminada' : 'Session Ended'}
          </button>
        ) : isFull ? (
          <button
            disabled
            className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed"
          >
            {language === 'es' ? 'Sesión Llena' : 'Session Full'}
          </button>
        ) : (
          <button
            onClick={() => sessionActions.setShowGuestModal(true)}
            className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
          >
            {language === 'es' ? 'Unirse como Invitado' : 'Join as Guest'}
          </button>
        )
      ) : isCreator ? (
        <>
          <div className="w-full py-3 bg-blue-100 text-blue-800 font-bold rounded-lg text-center">
            {language === 'es' ? 'Tú organizas esta sesión' : "You're hosting this session"}
          </div>
          {!isPast && (
            <>
              <button
                onClick={onEdit}
                className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                {language === 'es' ? 'Editar Sesión' : 'Edit Session'}
              </button>
              <button
                onClick={sessionActions.handleCancel}
                className="w-full py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2"
              >
                <Trash2 className="w-5 h-5" />
                {language === 'es' ? 'Cancelar Sesión' : 'Cancel Session'}
              </button>
            </>
          )}
        </>
      ) : hasJoined ? (
        <button
          onClick={sessionActions.handleLeave}
          className="w-full py-3 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" />
          {language === 'es' ? 'Salir de Sesión' : 'Leave Session'}
        </button>
      ) : isPast ? (
        <button
          disabled
          className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed"
        >
          {language === 'es' ? 'Sesión Terminada' : 'Session Ended'}
        </button>
      ) : isFull ? (
        <button
          disabled
          className="w-full py-3 bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400 font-bold rounded-lg cursor-not-allowed"
        >
          {language === 'es' ? 'Sesión Llena' : 'Session Full'}
        </button>
      ) : (
        <button
          onClick={sessionActions.handleJoin}
          disabled={sessionActions.joining}
          className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 disabled:opacity-50 transition"
        >
          {sessionActions.joining
            ? language === 'es'
              ? 'Uniéndose...'
              : 'Joining...'
            : language === 'es'
              ? 'Unirse a la Sesión'
              : 'Join Session'}
        </button>
      )}

      {hasJoined && !isPast && (
        <Link
          href={`/session/${session.id}/chat`}
          className="w-full py-3 bg-stone-700 text-white font-bold rounded-lg hover:bg-stone-600 transition flex items-center justify-center gap-2"
        >
          <MessageCircle className="w-5 h-5" />
          {language === 'es' ? 'Chat de Grupo' : 'Group Chat'}
        </Link>
      )}
      {hasJoined && !isPast && (
        <button
          onClick={onInvite}
          disabled={creatingInvite}
          className="w-full py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
        >
          {creatingInvite
            ? language === 'es'
              ? 'Generando...'
              : 'Generating...'
            : language === 'es'
              ? 'Invitar Amigo'
              : 'Invite Friend'}
        </button>
      )}
      {hasJoined && (
        <button
          onClick={() =>
            downloadICS({
              sport: session.sport,
              date: session.date,
              start_time: session.start_time,
              duration: session.duration,
              location: session.location,
              description: session.description,
              creatorName: session.creator?.name,
              sessionId: session.id,
            })
          }
          className="w-full py-3 border-2 border-tribe-green text-tribe-green dark:text-tribe-green font-bold rounded-lg hover:bg-tribe-green hover:text-slate-900 transition flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {language === 'es' ? 'Añadir al Calendario' : 'Add to Calendar'}
        </button>
      )}
    </div>
  );
}
