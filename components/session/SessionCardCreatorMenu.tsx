'use client';

import { useState } from 'react';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';

interface SessionCardCreatorMenuProps {
  sessionId: string;
  onEdit?: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
}

/**
 * The creator-only edit/delete menu in the card hero's top-right cluster.
 *
 * Split out of SessionCard so that file stays under the 300-line rule; the menu
 * owns its own open/closed state, which nothing else on the card reads.
 */
export default function SessionCardCreatorMenu({ sessionId, onEdit, onDelete }: SessionCardCreatorMenuProps) {
  const t = useTranslations('sessionCard');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);

  if (!onEdit && !onDelete) return null;

  function choose(e: React.MouseEvent, action?: (id: string) => void) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    action?.(sessionId);
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={t('options')}
        aria-expanded={open}
        className="min-w-[40px] min-h-[40px] flex items-center justify-center bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 rounded-full transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <>
          {/* Backdrop to close the menu on an outside click */}
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div className="absolute right-0 mt-1 w-36 bg-theme-elevated rounded-lg shadow-xl border border-theme z-20 overflow-hidden">
            {onEdit && (
              <button
                onClick={(e) => choose(e, onEdit)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-theme-primary hover:bg-stone-100 dark:hover:bg-tribe-mid transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                {tCommon('edit')}
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => choose(e, onDelete)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-stone-100 dark:hover:bg-tribe-mid transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {tCommon('delete')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
