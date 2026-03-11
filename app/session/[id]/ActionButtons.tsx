'use client';

import Link from 'next/link';
import { LogOut, Trash2, MessageCircle, Lock } from 'lucide-react';
import { downloadICS } from '@/lib/calendar';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';

interface ActionButtonsProps {
  language: 'en' | 'es';
  user: { id: string } | null;
  // REASON: session shape comes from DB with many nullable fields — loosely typed here
  session: any;
  isCreator: boolean;
  hasJoined: boolean;
  isPending: boolean;
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
  language: _language,
  user,
  session,
  isCreator,
  hasJoined,
  isPending,
  isPast,
  isFull,
  sessionActions,
  onEdit,
  onInvite,
  creatingInvite,
}: ActionButtonsProps) {
  const { t } = useLanguage();
  return (
    <div className="space-y-2">
      {!user ? (
        sessionActions.guestHasJoined ? (
          <Button
            onClick={sessionActions.handleGuestLeave}
            variant="destructive"
            className="w-full py-2 text-sm bg-orange-500 hover:bg-orange-600 font-bold flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            {t('leaveSession')}
          </Button>
        ) : isPast ? (
          <Button disabled className="w-full py-3 font-bold">
            {t('sessionEnded')}
          </Button>
        ) : isFull ? (
          <Button disabled className="w-full py-3 font-bold">
            {t('sessionFull')}
          </Button>
        ) : (
          <Button onClick={() => sessionActions.setShowGuestModal(true)} className="w-full py-3 font-bold">
            {t('joinAsGuest')}
          </Button>
        )
      ) : isCreator ? (
        <>
          <div className="w-full py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium text-sm rounded-lg text-center">
            {t('hostingThisSession')}
          </div>
          {!isPast && (
            <>
              <Button
                onClick={onEdit}
                variant="outline"
                className="w-full py-3 font-medium flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                {t('editSessionBtn')}
              </Button>
              <Button
                onClick={sessionActions.handleCancel}
                variant="destructive"
                className="w-full py-2 text-sm font-bold flex items-center justify-center gap-2"
              >
                <Trash2 className="w-5 h-5" />
                {t('cancelSession')}
              </Button>
            </>
          )}
        </>
      ) : isPending ? (
        <>
          <div className="w-full py-3 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 font-bold rounded-lg text-center">
            ⏳ {t('pendingApproval')}
          </div>
          <Button
            onClick={sessionActions.handleLeave}
            variant="destructive"
            className="w-full py-2 text-sm bg-orange-500 hover:bg-orange-600 font-bold flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            {t('withdrawRequest')}
          </Button>
        </>
      ) : hasJoined ? (
        isPast ? (
          <Button disabled className="w-full py-3 font-bold">
            {t('sessionEnded')}
          </Button>
        ) : (
          <Button
            onClick={sessionActions.handleLeave}
            variant="destructive"
            className="w-full py-2 text-sm bg-orange-500 hover:bg-orange-600 font-bold flex items-center justify-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            {t('leaveSession')}
          </Button>
        )
      ) : isPast ? (
        <Button disabled className="w-full py-3 font-bold">
          {t('sessionEnded')}
        </Button>
      ) : isFull ? (
        <Button disabled className="w-full py-3 font-bold">
          {t('sessionFull')}
        </Button>
      ) : session.join_policy === 'invite_only' ? (
        <div className="w-full py-3 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 font-bold rounded-lg text-center flex items-center justify-center gap-2">
          <Lock className="w-5 h-5" />
          {t('inviteOnlyLabel')}
        </div>
      ) : (
        <Button onClick={sessionActions.handleJoin} disabled={sessionActions.joining} className="w-full py-3 font-bold">
          {sessionActions.joining ? t('joining') : t('joinSession')}
        </Button>
      )}

      {(hasJoined || isCreator) && !isPast && (
        <Link
          href={`/session/${session.id}/chat`}
          className="w-full py-3 bg-stone-100 dark:bg-[#52575D] text-stone-700 dark:text-white font-medium rounded-lg hover:bg-stone-200 dark:hover:bg-[#5d6269] transition flex items-center justify-center gap-2"
        >
          <MessageCircle className="w-5 h-5" />
          {t('groupChat')}
        </Link>
      )}
      {(hasJoined || isCreator) && !isPast && (
        <Button onClick={onInvite} disabled={creatingInvite} variant="outline" className="w-full py-3 font-medium">
          {creatingInvite ? t('generating') : t('inviteFriend')}
        </Button>
      )}
      {(hasJoined || isCreator) && (
        <Button
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
          variant="outline"
          className="w-full py-3 border-2 border-tribe-green text-tribe-green dark:text-tribe-green hover:bg-tribe-green hover:text-slate-900 font-medium flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {t('addToCalendar')}
        </Button>
      )}
    </div>
  );
}
