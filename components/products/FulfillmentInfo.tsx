'use client';

import { Package, Download, Ticket } from 'lucide-react';

interface FulfillmentInfoProps {
  productType: string;
  pickupInstructions?: string;
  sessionCredits?: number;
  validDays?: number;
  language: 'en' | 'es';
}

export default function FulfillmentInfo({
  productType,
  pickupInstructions,
  sessionCredits,
  validDays,
  language,
}: FulfillmentInfoProps) {
  if (productType === 'physical') {
    return (
      <div className="flex items-start gap-3 bg-stone-50 dark:bg-tribe-surface rounded-xl p-4">
        <Package className="w-5 h-5 text-tribe-green mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-theme-primary">{language === 'es' ? 'Recogida' : 'Pickup'}</p>
          <p className="text-xs text-theme-secondary mt-0.5">
            {pickupInstructions || (language === 'es' ? 'Coordinar con el instructor' : 'Coordinate with instructor')}
          </p>
        </div>
      </div>
    );
  }

  if (productType === 'digital') {
    return (
      <div className="flex items-start gap-3 bg-stone-50 dark:bg-tribe-surface rounded-xl p-4">
        <Download className="w-5 h-5 text-tribe-green mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-theme-primary">
            {language === 'es' ? 'Descarga instant\u00E1nea' : 'Instant download'}
          </p>
          <p className="text-xs text-theme-secondary mt-0.5">
            {language === 'es'
              ? 'Recibir\u00E1s el archivo despu\u00E9s del pago'
              : "You'll receive the file after payment"}
          </p>
        </div>
      </div>
    );
  }

  if (productType === 'package') {
    return (
      <div className="flex items-start gap-3 bg-stone-50 dark:bg-tribe-surface rounded-xl p-4">
        <Ticket className="w-5 h-5 text-tribe-green mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-theme-primary">
            {language === 'es' ? 'Paquete de Sesiones' : 'Session Pack'}
          </p>
          <p className="text-xs text-theme-secondary mt-0.5">
            {sessionCredits ?? 0} {language === 'es' ? 'sesiones' : 'sessions'}
            {' \u00B7 '}
            {language === 'es' ? 'V\u00E1lido por' : 'Valid for'} {validDays ?? 90}{' '}
            {language === 'es' ? 'd\u00EDas' : 'days'}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
