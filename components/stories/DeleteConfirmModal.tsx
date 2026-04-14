'use client';

import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';

interface DeleteConfirmModalProps {
  language: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteConfirmModal({
  language: _language,
  deleting,
  onCancel,
  onConfirm,
}: DeleteConfirmModalProps) {
  const { t } = useLanguage();
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="bg-white dark:bg-tribe-card rounded-2xl p-6 mx-6 max-w-sm w-full">
        <p className="text-lg font-bold text-theme-primary text-center mb-4">{t('deleteThisStory')}</p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 py-3 font-semibold rounded-xl bg-stone-200 dark:bg-tribe-surface hover:bg-stone-300 dark:hover:bg-tribe-mid"
          >
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 py-3 font-semibold rounded-xl flex items-center justify-center gap-2"
          >
            {deleting ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {t('delete')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
