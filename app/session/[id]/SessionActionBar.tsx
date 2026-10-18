'use client';

import { Check, Clock, Lock, Settings2, Share2 } from 'lucide-react';
import PaidSessionRequest from '@/components/session/PaidSessionRequest';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { AthleteBarState } from './sessionActionState';

/**
 * T-UI-SD1: the one primary action of the signed-in session page, pinned to
 * the bottom edge (the page renders no BottomNav, same as T-PAY2's pay bar).
 *
 *   host     "Compartir" while upcoming, and "Gestionar" (edit, invite, chat,
 *            cancel, Tribe.OS attendance) in a sheet.
 *   athlete  one button per state (lib: athleteBarState). "Cancelar mi cupo"
 *            and "Cancelar solicitud" go through the page's confirm dialog.
 */
const PRIMARY =
  'flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-tribe-green px-4 py-3 text-[15px] font-extrabold text-slate-900 transition hover:bg-lime-500 disabled:opacity-60';
const SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-stone-900 dark:border-white bg-white dark:bg-transparent px-4 py-3 text-[15px] font-bold text-stone-900 dark:text-white transition hover:bg-stone-50 dark:hover:bg-tribe-mid';
const STATUS =
  'flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-stone-100 dark:bg-tribe-mid px-4 py-3 text-[15px] font-bold text-stone-700 dark:text-gray-200';

export type SessionActionBarProps =
  | {
      role: 'host';
      isPast: boolean;
      onShare: () => void;
      onManage: () => void;
    }
  | {
      role: 'athlete';
      state: AthleteBarState;
      isPaid: boolean;
      joining: boolean;
      onJoin: () => void;
      onLeave: () => void;
      paid: {
        priceCents: number;
        currency: string;
        paymentInstructions: string | null;
        canViewPaymentInstructions: boolean;
      } | null;
      language: 'en' | 'es';
    };

export default function SessionActionBar(props: SessionActionBarProps) {
  const t = useTranslations('sessionDetail');

  let content: React.ReactNode;
  if (props.role === 'host') {
    content = props.isPast ? (
      <button type="button" onClick={props.onManage} className={`${SECONDARY} flex-1`}>
        <Settings2 className="w-5 h-5" />
        {t('manage')}
      </button>
    ) : (
      <>
        <button type="button" onClick={props.onShare} className={PRIMARY}>
          <Share2 className="w-5 h-5" />
          {t('share')}
        </button>
        <button type="button" onClick={props.onManage} className={SECONDARY}>
          <Settings2 className="w-5 h-5" />
          {t('manage')}
        </button>
      </>
    );
  } else {
    switch (props.state) {
      case 'book':
        content = (
          <button type="button" onClick={props.onJoin} disabled={props.joining} className={PRIMARY}>
            {props.joining ? t('joining') : t('book')}
          </button>
        );
        break;
      case 'request':
        content = props.paid ? (
          <div className="flex-1">
            <PaidSessionRequest
              priceCents={props.paid.priceCents}
              currency={props.paid.currency}
              paymentInstructions={props.paid.canViewPaymentInstructions ? props.paid.paymentInstructions : null}
              canViewPaymentInstructions={props.paid.canViewPaymentInstructions}
              onRequest={props.onJoin}
              requesting={props.joining}
              language={props.language}
              showPriceCard={false}
              buttonClassName={`${PRIMARY} w-full h-auto`}
            />
          </div>
        ) : null;
        break;
      case 'pending':
        content = (
          <>
            <span className={STATUS}>
              <Clock className="w-5 h-5" />
              {props.isPaid ? t('pendingPaid') : t('pending')}
            </span>
            <button type="button" onClick={props.onLeave} className={SECONDARY}>
              {t('withdraw')}
            </button>
          </>
        );
        break;
      case 'joined':
        content = (
          <>
            <span className={`${STATUS} bg-tribe-green/15 text-stone-900 dark:text-white`}>
              <Check className="w-5 h-5" />
              {t('joined')}
            </span>
            <button type="button" onClick={props.onLeave} className={SECONDARY}>
              {t('cancelSpot')}
            </button>
          </>
        );
        break;
      case 'full':
        content = <span className={STATUS}>{t('full')}</span>;
        break;
      case 'ended':
        content = <span className={STATUS}>{t('ended')}</span>;
        break;
      case 'invite_only':
        content = (
          <span className={STATUS}>
            <Lock className="w-5 h-5" />
            {t('inviteOnly')}
          </span>
        );
        break;
    }
  }

  return (
    <div
      data-testid="session-action-bar"
      style={{ paddingBottom: 'var(--safe-area-inset-bottom, 0px)' }}
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200 dark:border-tribe-mid bg-[#F7F8F6]/95 dark:bg-tribe-card/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-2xl items-stretch gap-2 px-4 py-3">{content}</div>
    </div>
  );
}
