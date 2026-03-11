'use client';

import type { ChatTranslations } from './chatTranslations';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface ReportModalProps {
  tr: ChatTranslations;
  reportReason: string;
  reportDescription: string;
  onReasonChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function ReportModal({
  tr,
  reportReason,
  reportDescription,
  onReasonChange,
  onDescriptionChange,
  onClose,
  onSubmit,
}: ReportModalProps) {
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-modal="true" className="bg-white dark:bg-[#404549] rounded-lg p-6 max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-stone-900 dark:text-white">{tr.reportMessage}</DialogTitle>
          <DialogDescription className="sr-only">{tr.reportMessage}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">{tr.reason}</label>
            <select
              value={reportReason}
              onChange={(e) => onReasonChange(e.target.value)}
              className="w-full p-2 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
            >
              <option value="">{tr.selectReason}</option>
              <option value="spam">{tr.spam}</option>
              <option value="harassment">{tr.harassment}</option>
              <option value="inappropriate">{tr.inappropriate}</option>
              <option value="offensive">{tr.offensive}</option>
              <option value="other">{tr.other}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">{tr.details}</label>
            <textarea
              value={reportDescription}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder={tr.moreContext}
              className="w-full p-2 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-stone-900 dark:text-white h-20 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-700 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-[#52575D]"
          >
            {tr.cancel}
          </button>
          <button
            onClick={onSubmit}
            disabled={!reportReason}
            className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
          >
            {tr.submitReport}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
