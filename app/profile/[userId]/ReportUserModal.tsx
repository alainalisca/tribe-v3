'use client';

import type { ProfileTranslations } from './translations';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface ReportUserModalProps {
  t: ProfileTranslations;
  reportReason: string;
  reportDescription: string;
  submitting: boolean;
  onReasonChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function ReportUserModal({
  t,
  reportReason,
  reportDescription,
  submitting,
  onReasonChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}: ReportUserModalProps) {
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-modal="true" className="bg-white dark:bg-[#404549] rounded-lg p-6 max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold dark:text-white">{t.reportUser}</DialogTitle>
          <DialogDescription className="sr-only">{t.reportUser}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium dark:text-gray-300 mb-2">{t.reason} *</label>
            <select
              value={reportReason}
              onChange={(e) => onReasonChange(e.target.value)}
              className="w-full p-2 border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-900 dark:text-white bg-white dark:bg-[#52575D]"
            >
              <option value="">{t.selectReason}</option>
              <option value="harassment">{t.harassment}</option>
              <option value="inappropriate">{t.inappropriate}</option>
              <option value="spam">{t.spam}</option>
              <option value="fake">{t.fake}</option>
              <option value="no-show">{t.noShow}</option>
              <option value="other">{t.other}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium dark:text-gray-300 mb-2">{t.additionalDetails}</label>
            <textarea
              value={reportDescription}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder={t.provideContext}
              className="w-full p-2 border border-stone-300 dark:border-[#52575D] rounded-lg h-24 resize-none text-stone-900 dark:text-white bg-white dark:bg-[#52575D]"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-700 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-[#52575D]"
            disabled={submitting}
          >
            {t.cancel}
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting || !reportReason}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
          >
            {submitting ? t.submitting : t.submit}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
