'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { Ticket } from 'lucide-react';

interface SessionCreditBannerProps {
  credits: number;
  sessionPrice: string;
  onUseCredit: () => void;
  onPayInstead: () => void;
}

export default function SessionCreditBanner({
  credits,
  sessionPrice,
  onUseCredit,
  onPayInstead,
}: SessionCreditBannerProps) {
  const { language } = useLanguage();

  return (
    <div className="bg-tribe-green/10 border border-tribe-green/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Ticket className="w-5 h-5 text-tribe-green" />
        <p className="text-sm font-bold text-theme-primary">
          {language === 'es'
            ? `Tienes ${credits} cr\u00E9dito${credits !== 1 ? 's' : ''} de sesi\u00F3n`
            : `You have ${credits} session credit${credits !== 1 ? 's' : ''}`}
        </p>
      </div>

      <p className="text-xs text-theme-secondary">
        {language === 'es'
          ? `Usa 1 cr\u00E9dito en vez de pagar ${sessionPrice}`
          : `Use 1 credit instead of paying ${sessionPrice}`}
      </p>

      <div className="flex gap-2">
        <Button
          onClick={onUseCredit}
          className="flex-1 bg-tribe-green text-slate-900 hover:bg-tribe-green-hover font-bold text-sm"
        >
          {language === 'es' ? 'Usar Cr\u00E9dito' : 'Use Credit'}
        </Button>
        <Button
          onClick={onPayInstead}
          variant="outline"
          className="flex-1 border-theme text-theme-primary font-bold text-sm"
        >
          {language === 'es' ? 'Pagar' : 'Pay Instead'}
        </Button>
      </div>
    </div>
  );
}
