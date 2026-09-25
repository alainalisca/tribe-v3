'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';

export interface CommunityCoverPickerProps {
  label: string;
  hint: string;
  /** What to show as the thumbnail: a picked file's object URL, or the pasted URL. */
  previewUrl: string | null;
  urlValue: string;
  onPickFile: (file: File) => void;
  onUrlChange: (url: string) => void;
}

/**
 * The create page's cover control: upload a file, or paste the URL of an image
 * that is already hosted. It only reports the choice. Nothing is uploaded from
 * here, because on the create page the community (and so its banner folder)
 * does not exist yet. The page uploads after the insert (T-COMM1).
 */
export default function CommunityCoverPicker({
  label,
  hint,
  previewUrl,
  urlValue,
  onPickFile,
  onUrlChange,
}: CommunityCoverPickerProps) {
  const t = useTranslations('communityCover');
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-theme-primary">{label}</label>
      <p className="text-xs text-stone-500 dark:text-gray-400">{hint}</p>
      <div className="flex items-center gap-3">
        <input
          id="community-cover-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPickFile(file);
          }}
        />
        <label
          htmlFor="community-cover-upload"
          className="px-4 py-2 bg-tribe-green text-slate-900 rounded-lg font-semibold text-sm cursor-pointer hover:bg-lime-500 transition"
        >
          {t('uploadImage')}
        </label>
        {previewUrl && (
          <img
            src={previewUrl}
            alt=""
            className="w-12 h-12 rounded-lg object-cover border border-stone-200 dark:border-tribe-card"
          />
        )}
      </div>
      <input
        type="url"
        placeholder={t('pasteUrl')}
        value={urlValue}
        onChange={(e) => onUrlChange(e.target.value)}
        className="w-full px-4 py-3 bg-stone-100 dark:bg-tribe-mid rounded-lg border border-stone-200 dark:border-tribe-card text-theme-primary placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent text-sm"
      />
    </div>
  );
}
