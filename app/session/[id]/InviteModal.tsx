'use client';

import { showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

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
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-modal="true" className="bg-white dark:bg-tribe-card rounded-xl max-w-md w-full p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-theme-primary">{t('inviteFriend')}</DialogTitle>
          <DialogDescription className="text-sm text-stone-600 dark:text-gray-300">
            {t('shareInviteDesc')}
          </DialogDescription>
        </DialogHeader>
        <div className="bg-stone-50 dark:bg-tribe-mid p-3 rounded-lg mb-4 break-all text-sm">{inviteLink}</div>
        <div className="flex gap-3">
          <Button
            onClick={copyInviteLink}
            variant="secondary"
            className="flex-1 py-3 bg-stone-200 dark:bg-tribe-mid text-theme-primary hover:bg-stone-300 dark:hover:bg-tribe-card font-medium"
          >
            {t('copy')}
          </Button>
          <Button onClick={shareInviteLink} className="flex-1 py-3 font-medium">
            {t('share')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
