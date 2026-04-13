'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface GuestJoinModalProps {
  language: 'en' | 'es';
  guestData: { name: string; phone: string; email: string };
  joiningAsGuest: boolean;
  onClose: () => void;
  onGuestDataChange: (data: { name: string; phone: string; email: string }) => void;
  onSubmit: () => void;
}

export default function GuestJoinModal({
  language: _language,
  guestData,
  joiningAsGuest,
  onClose,
  onGuestDataChange,
  onSubmit,
}: GuestJoinModalProps) {
  const { t } = useLanguage();
  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-modal="true" className="bg-white dark:bg-tribe-card rounded-xl max-w-md w-full p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-theme-primary">{t('joinAsGuest')}</DialogTitle>
          <DialogDescription className="text-sm text-stone-600 dark:text-gray-300">
            {t('enterDetailsToConfirm')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            type="text"
            placeholder={t('fullName')}
            value={guestData.name}
            onChange={(e) => onGuestDataChange({ ...guestData, name: e.target.value })}
            className="h-auto py-3 dark:border-[#52575D] bg-white dark:bg-tribe-mid text-theme-primary"
          />
          <Input
            type="tel"
            placeholder={t('phone')}
            value={guestData.phone}
            onChange={(e) => onGuestDataChange({ ...guestData, phone: e.target.value })}
            className="h-auto py-3 dark:border-[#52575D] bg-white dark:bg-tribe-mid text-theme-primary"
          />
          <Input
            type="email"
            placeholder={t('emailOptional')}
            value={guestData.email}
            onChange={(e) => onGuestDataChange({ ...guestData, email: e.target.value })}
            className="h-auto py-3 dark:border-[#52575D] bg-white dark:bg-tribe-mid text-theme-primary"
          />
        </div>
        <Button onClick={onSubmit} disabled={joiningAsGuest} className="w-full mt-4 py-3 font-bold">
          {joiningAsGuest ? t('confirming') : t('confirmAttendance')}
        </Button>
        <p className="text-xs text-center text-stone-500 dark:text-gray-400 mt-3">
          {t('alreadyHaveAccount')}{' '}
          <a href="/auth" className="text-tribe-green hover:underline">
            {t('signInLink')}
          </a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
