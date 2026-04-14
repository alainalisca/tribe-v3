'use client';

import { Share2, Copy } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast';
import {
  shareSession,
  shareViaWhatsApp,
  buildSessionShareText,
  getSessionShareUrl,
  type SessionShareData,
} from '@/lib/share';

interface PostSessionShareStepProps {
  sessionId: string;
  sport: string;
  creatorName: string;
  language: 'en' | 'es';
  sessionTitle?: string;
  sessionDate?: string;
  sessionTime?: string;
  locationName?: string;
  neighborhood?: string;
  price?: string;
  onNext: () => void;
}

export default function PostSessionShareStep({
  sessionId,
  sport,
  creatorName,
  language,
  sessionTitle,
  sessionDate,
  sessionTime,
  locationName,
  neighborhood,
  price,
  onNext,
}: PostSessionShareStepProps) {
  const t = (en: string, es: string): string => (language === 'es' ? es : en);

  const shareData: SessionShareData = {
    id: sessionId,
    title: sessionTitle || creatorName,
    sport,
    date: sessionDate || new Date().toISOString().split('T')[0],
    time: sessionTime,
    neighborhood,
    instructorName: creatorName,
  };
  const shareText = buildSessionShareText(shareData, language);
  const shareUrl = getSessionShareUrl(sessionId);

  async function handleWhatsApp() {
    shareViaWhatsApp(shareText, shareUrl);
    showSuccess(t('Opening WhatsApp...', 'Abriendo WhatsApp...'));
  }

  async function handleNativeShare() {
    await shareSession(shareData, language);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showSuccess(t('Link copied!', 'Enlace copiado!'));
    } catch {
      showError(t('Could not copy link', 'No se pudo copiar el enlace'));
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h3 className="text-lg font-bold text-stone-900 dark:text-white">
          {t('Share Your Session', 'Comparte Tu Sesion')}
        </h3>
        <p className="text-sm text-stone-500 dark:text-gray-400 mt-1">
          {t('Let your friends know you trained!', 'Deja que tus amigos sepan que entrenaste!')}
        </p>
      </div>

      {/* Preview card */}
      <div className="bg-stone-50 dark:bg-tribe-card rounded-xl p-4 border border-stone-200 dark:border-tribe-mid text-sm text-stone-700 dark:text-gray-300 whitespace-pre-line">
        {shareText}
        <p className="mt-2 text-tribe-green text-xs break-all">{shareUrl}</p>
      </div>

      <div className="space-y-2">
        {/* WhatsApp */}
        <button
          onClick={handleWhatsApp}
          className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
            text-white hover:opacity-90 hover:scale-[1.02] active:scale-95
            flex items-center justify-center gap-2"
          style={{ backgroundColor: '#25D366' }}
        >
          <Share2 className="w-4 h-4" />
          {t('Share via WhatsApp', 'Compartir por WhatsApp')}
        </button>

        {/* Native share (if available) */}
        {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
          <button
            onClick={handleNativeShare}
            className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
              bg-tribe-green-light hover:bg-lime-500 text-stone-900 hover:scale-[1.02] active:scale-95
              flex items-center justify-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            {t('Share', 'Compartir')}
          </button>
        )}

        {/* Copy link */}
        <button
          onClick={handleCopyLink}
          className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
            bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-gray-300
            hover:bg-stone-200 dark:hover:bg-stone-700
            flex items-center justify-center gap-2"
        >
          <Copy className="w-4 h-4" />
          {t('Copy Link', 'Copiar Enlace')}
        </button>

        {/* Skip */}
        <button
          onClick={onNext}
          className="w-full py-2.5 text-sm font-medium text-stone-500 dark:text-gray-400 hover:text-stone-700 dark:hover:text-gray-300 transition-colors"
        >
          {t('Skip', 'Omitir')}
        </button>
      </div>
    </div>
  );
}
