'use client';

import { X } from 'lucide-react';
import { showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';

interface InviteModalProps {
  language: 'en' | 'es';
  inviteLink: string;
  session: { sport: string; location: string };
  onClose: () => void;
}

export default function InviteModal({ language, inviteLink, session, onClose }: InviteModalProps) {
  const { t } = useLanguage();
  function copyInviteLink() {
    navigator.clipboard.writeText(inviteLink);
    showSuccess(t('linkCopied'));
  }

  function shareInviteLink() {
    if (navigator.share) {
      navigator
        .share({
          title: language === 'es' ? `Únete a mi sesión de ${session.sport}` : `Join me for ${session.sport}`,
          text:
            language === 'es'
              ? `Voy a entrenar ${session.sport} en ${session.location}. ¡Únete!`
              : `I'm training ${session.sport} at ${session.location}. Join me!`,
          url: inviteLink,
        })
        .catch(() => {});
    } else copyInviteLink();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-modal="true">
      <div className="bg-white dark:bg-[#6B7178] rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-theme-primary">{t('inviteFriend')}</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5 text-theme-primary" />
          </Button>
        </div>
        <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">{t('shareInviteDesc')}</p>
        <div className="bg-stone-50 dark:bg-[#52575D] p-3 rounded-lg mb-4 break-all text-sm">{inviteLink}</div>
        <div className="flex gap-3">
          <Button
            onClick={copyInviteLink}
            variant="secondary"
            className="flex-1 py-3 bg-stone-200 dark:bg-[#52575D] text-theme-primary hover:bg-stone-300 dark:hover:bg-[#6B7178] font-medium"
          >
            {t('copy')}
          </Button>
          <Button onClick={shareInviteLink} className="flex-1 py-3 font-medium">
            {t('share')}
          </Button>
        </div>
      </div>
    </div>
  );
}
