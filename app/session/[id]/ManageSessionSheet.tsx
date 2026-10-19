'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronRight, ImagePlus, MessageCircle, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import CancelSeriesDialog from '@/components/session/CancelSeriesDialog';
import { useTranslations } from '@/lib/i18n/useTranslations';

/**
 * T-UI-SD1: everything the host can do besides sharing, in one bottom sheet
 * behind the bar's "Gestionar": the test-session status, Editar sesión,
 * Invitar amigo, Chat grupal, Tribe.OS client attendance (passed in as
 * children; it renders nothing for a host without Tribe.OS) and, last,
 * Cancelar sesión. Edit, invite, chat and cancel are for an upcoming session
 * only, as before.
 *
 * Cancelling closes the sheet first: a series asks which dates
 * (CancelSeriesDialog), a one-off goes to the page's own confirm dialog.
 */
export default function ManageSessionSheet({
  open,
  onClose,
  sessionId,
  language,
  isTest,
  isPast,
  isSeriesMember,
  isSeriesParent,
  creatingInvite,
  onEdit,
  onInvite,
  onCancel,
  onCancelOccurrence,
  onEndSeries,
  children,
  uploadPhotosHref = null,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  language: 'en' | 'es';
  isTest: boolean;
  isPast: boolean;
  isSeriesMember: boolean;
  isSeriesParent: boolean;
  creatingInvite: boolean;
  onEdit: () => void;
  onInvite: () => void;
  onCancel: () => void;
  onCancelOccurrence: () => void;
  onEndSeries: () => void;
  children?: React.ReactNode;
  /** T-MOM1: the photo upload screen, when Moments is on (also after the session: photos come afterwards). */
  uploadPhotosHref?: string | null;
}) {
  const t = useTranslations('sessionDetail');
  const tm = useTranslations('moments');
  const [seriesDialog, setSeriesDialog] = useState(false);
  const row =
    'w-full flex items-center justify-between gap-3 px-1 py-3.5 text-[15px] font-semibold text-stone-900 dark:text-white border-b border-stone-200 dark:border-tribe-mid disabled:opacity-60';

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(39,45,52,0.45)]" />
          <DialogPrimitive.Content
            data-testid="manage-session-sheet"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85vh] max-w-2xl overflow-y-auto rounded-t-[22px] bg-white dark:bg-tribe-card px-4 pt-3 shadow-[0_-10px_30px_rgba(0,0,0,0.18)]"
            style={{ paddingBottom: 'calc(1.25rem + var(--safe-area-inset-bottom, 0px))' }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded bg-stone-200 dark:bg-tribe-mid" aria-hidden="true" />
            <div className="flex items-center justify-between">
              <DialogPrimitive.Title className="text-lg font-extrabold text-stone-900 dark:text-white">
                {t('manageTitle')}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                className="rounded-full p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-tribe-mid"
                aria-label={t('close')}
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description
              className={`mt-2 rounded-lg px-3 py-2 text-sm ${
                isTest
                  ? 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'bg-stone-100 text-stone-600 dark:bg-tribe-mid dark:text-gray-300'
              }`}
            >
              {isTest ? t('testOn') : t('testOff')}
            </DialogPrimitive.Description>

            {uploadPhotosHref && (
              <Link href={uploadPhotosHref} className={`${row} mt-2`}>
                <span className="flex items-center gap-3">
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  {tm('uploadPhotos')}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            )}

            {!isPast && (
              <div className="mt-2">
                <button
                  type="button"
                  className={row}
                  onClick={() => {
                    onClose();
                    onEdit();
                  }}
                >
                  <span className="flex items-center gap-3">
                    <Pencil className="h-5 w-5 text-muted-foreground" />
                    {t('edit')}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  className={row}
                  onClick={() => {
                    onClose();
                    onInvite();
                  }}
                  disabled={creatingInvite}
                >
                  <span className="flex items-center gap-3">
                    <UserPlus className="h-5 w-5 text-muted-foreground" />
                    {creatingInvite ? t('inviting') : t('invite')}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <Link href={`/session/${sessionId}/chat`} className={row}>
                  <span className="flex items-center gap-3">
                    <MessageCircle className="h-5 w-5 text-muted-foreground" />
                    {t('groupChat')}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>
            )}

            {children && <div className="mt-4">{children}</div>}

            {!isPast && (
              <button
                type="button"
                className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-red-600 px-4 py-3 text-[15px] font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={() => {
                  onClose();
                  if (isSeriesMember) setSeriesDialog(true);
                  else onCancel();
                }}
              >
                <Trash2 className="h-5 w-5" />
                {t('cancelSession')}
              </button>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <CancelSeriesDialog
        open={seriesDialog}
        isParent={isSeriesParent}
        language={language}
        onCancelOne={() => {
          setSeriesDialog(false);
          onCancelOccurrence();
        }}
        onEndSeries={() => {
          setSeriesDialog(false);
          onEndSeries();
        }}
        onClose={() => setSeriesDialog(false)}
      />
    </>
  );
}
