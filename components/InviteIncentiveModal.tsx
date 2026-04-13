/** Component: InviteIncentiveModal — Modal for inviting a friend to a specific session */
'use client';

import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

interface InviteIncentiveModalProps {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
  isOpen?: boolean;
}

export default function InviteIncentiveModal({
  sessionId,
  sessionTitle,
  onClose,
  isOpen = true,
}: InviteIncentiveModalProps) {
  const { language } = useLanguage();
  const [copied, setCopied] = useState(false);

  const txt = {
    en: {
      inviteFriend: 'Invite a friend to this session',
      shareLink: 'Share this link',
      incentive: 'If your friend joins, you both get 10% off your next paid session',
      copyLink: 'Copy Link',
      codeCopied: 'Copied!',
      shareWhatsApp: 'Share via WhatsApp',
      share: 'Share',
    },
    es: {
      inviteFriend: 'Invita a un amigo a esta sesión',
      shareLink: 'Comparte este enlace',
      incentive: 'Si tu amigo se une, ambos obtienen 10% de descuento en tu próxima sesión pagada',
      copyLink: 'Copiar Enlace',
      codeCopied: '¡Copiado!',
      shareWhatsApp: 'Compartir por WhatsApp',
      share: 'Compartir',
    },
  };

  const t = txt[language as keyof typeof txt] || txt.en;

  const inviteLink =
    typeof window !== 'undefined' ? `${window.location.origin}/session/${sessionId}?invite=true` : `${sessionId}`;

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const message = encodeURIComponent(
      language === 'es'
        ? `¡Únete a mi sesión de ${sessionTitle} en Tribe! ${inviteLink}`
        : `Join my ${sessionTitle} session on Tribe! ${inviteLink}`
    );
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: sessionTitle,
          text: language === 'es' ? `Únete a mi sesión de ${sessionTitle}` : `Join my ${sessionTitle} session`,
          url: inviteLink,
        });
      } catch (err) {
        logError(err, { action: 'shareInvite' });
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-modal="true" className="max-w-sm rounded-xl p-6 dark:bg-tribe-surface">
        <DialogTitle className="text-lg font-bold text-stone-900 dark:text-white">{t.inviteFriend}</DialogTitle>

        <div className="mt-4 space-y-4">
          {/* Incentive Card */}
          <div className="bg-tribe-green/10 border border-tribe-green/30 rounded-lg p-4">
            <p className="text-sm text-stone-700 dark:text-gray-300">{t.incentive}</p>
          </div>

          {/* Share Link Display */}
          <div>
            <label className="text-sm font-semibold text-stone-700 dark:text-gray-300 block mb-2">{t.shareLink}</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inviteLink}
                readOnly
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-stone-100 dark:bg-tribe-mid text-stone-900 dark:text-white border border-stone-200 dark:border-tribe-mid"
              />
              <button
                onClick={handleCopyLink}
                className="p-2 bg-tribe-green hover:bg-tribe-green-hover text-slate-900 rounded-lg transition font-semibold"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Share Buttons */}
          <div className="space-y-2">
            <button
              onClick={handleCopyLink}
              className="w-full py-3 rounded-lg bg-stone-100 dark:bg-tribe-surface text-stone-900 dark:text-white font-semibold hover:bg-stone-200 dark:hover:bg-tribe-mid transition flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" />
              {t.copyLink}
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="w-full py-3 rounded-lg bg-stone-100 dark:bg-tribe-surface text-stone-900 dark:text-white font-semibold hover:bg-stone-200 dark:hover:bg-tribe-mid transition flex items-center justify-center gap-2"
            >
              <span className="text-lg">💬</span>
              {t.shareWhatsApp}
            </button>

            {'share' in navigator && (
              <button
                onClick={handleShare}
                className="w-full py-3 rounded-lg bg-stone-100 dark:bg-tribe-surface text-stone-900 dark:text-white font-semibold hover:bg-stone-200 dark:hover:bg-tribe-mid transition flex items-center justify-center gap-2"
              >
                <span className="text-lg">↗️</span>
                {t.share}
              </button>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-stone-300 dark:border-tribe-mid rounded-lg text-stone-700 dark:text-gray-300 hover:bg-stone-100 dark:hover:bg-tribe-mid font-medium"
          >
            {language === 'es' ? 'Cerrar' : 'Close'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
