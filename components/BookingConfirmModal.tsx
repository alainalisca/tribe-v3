'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Clock, MapPin, CreditCard, Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';
import { getPaymentGateway } from '@/lib/payments/config';

interface BookingSession {
  id: string;
  title: string;
  sport: string;
  date: string;
  time: string;
  price: number;
  currency?: string;
  is_paid?: boolean;
  price_cents?: number;
  location?: string;
}

interface BookingConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  session: BookingSession;
  language: 'en' | 'es';
  processing: boolean;
}

export default function BookingConfirmModal({
  open,
  onClose,
  onConfirm,
  session,
  language,
  processing,
}: BookingConfirmModalProps): React.JSX.Element {
  const currency = (session.currency || 'COP') as Currency;
  const gateway = getPaymentGateway(currency);

  // Use price_cents if available, otherwise treat session.price as display amount
  const displayPrice = session.price_cents
    ? formatPrice(session.price_cents, currency)
    : `$${session.price.toLocaleString(currency === 'COP' ? 'es-CO' : 'en-US', { maximumFractionDigits: currency === 'COP' ? 0 : 2 })}`;

  const formattedDate = new Date(session.date).toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="bg-white dark:bg-tribe-card border-stone-200 dark:border-gray-700 max-w-sm mx-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-theme-primary text-lg">
            {language === 'es' ? 'Confirmar Reserva' : 'Confirm Booking'}
          </DialogTitle>
          <DialogDescription className="text-theme-secondary text-sm">
            {language === 'es' ? 'Revisa los detalles antes de pagar' : 'Review details before paying'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Session info */}
          <div className="bg-stone-50 dark:bg-tribe-surface rounded-xl p-3 space-y-2">
            <p className="font-bold text-theme-primary text-base">{session.sport}</p>
            <p className="text-theme-secondary text-sm">{session.title}</p>

            <div className="flex items-center gap-2 text-xs text-theme-secondary">
              <Clock className="w-3.5 h-3.5 text-tribe-green flex-shrink-0" />
              <span>
                {formattedDate} &middot; {session.time}
              </span>
            </div>

            {session.location && (
              <div className="flex items-center gap-2 text-xs text-theme-secondary">
                <MapPin className="w-3.5 h-3.5 text-tribe-green flex-shrink-0" />
                <span className="line-clamp-1">{session.location}</span>
              </div>
            )}
          </div>

          {/* Price breakdown */}
          <div className="bg-stone-50 dark:bg-tribe-surface rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-secondary">{language === 'es' ? 'Sesion' : 'Session'}</span>
              <span className="text-theme-primary font-semibold">
                {displayPrice} {currency}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-secondary">
                {language === 'es' ? 'Tarifa de plataforma' : 'Platform fee'}
              </span>
              <span className="text-tribe-green font-semibold">{language === 'es' ? 'Incluida' : 'Included'}</span>
            </div>
            <div className="border-t border-stone-200 dark:border-gray-600 pt-2 flex items-center justify-between">
              <span className="font-bold text-theme-primary">Total</span>
              <span className="font-bold text-lg text-tribe-green">
                {displayPrice} {currency}
              </span>
            </div>
          </div>

          {/* Payment method indicator */}
          <div className="flex items-center gap-2 text-xs text-theme-secondary px-1">
            <CreditCard className="w-3.5 h-3.5" />
            <span>
              {gateway === 'wompi'
                ? language === 'es'
                  ? 'Pago con Wompi (Nequi, PSE, tarjeta)'
                  : 'Pay with Wompi (Nequi, PSE, card)'
                : language === 'es'
                  ? 'Pago con Stripe (tarjeta de credito/debito)'
                  : 'Pay with Stripe (credit/debit card)'}
            </span>
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-col">
          <Button
            onClick={onConfirm}
            disabled={processing}
            className="w-full py-3 font-bold bg-tribe-green text-slate-900 hover:bg-tribe-green rounded-xl"
          >
            {processing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {language === 'es' ? 'Procesando...' : 'Processing...'}
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                {language === 'es' ? 'Confirmar y Pagar' : 'Confirm & Pay'}
              </>
            )}
          </Button>
          <Button
            onClick={onClose}
            disabled={processing}
            variant="ghost"
            className="w-full text-theme-secondary hover:text-theme-primary rounded-xl"
          >
            {language === 'es' ? 'Cancelar' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
