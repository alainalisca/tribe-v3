'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface SubscribeButtonProps {
  sessionId: string;
  instructorId: string;
  userId: string;
  isRecurring: boolean;
  recurrencePattern: string;
  price: number | null;
  currency: string;
}

export default function SubscribeButton({
  sessionId,
  instructorId,
  userId,
  isRecurring,
  recurrencePattern,
  price,
  currency,
}: SubscribeButtonProps) {
  const { t, language } = useLanguage();
  const supabase = createClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  if (!isRecurring) {
    return null;
  }

  const getFrequencyText = (): string => {
    const freq = recurrencePattern?.split('_')[0] || 'weekly';
    return language === 'es'
      ? { weekly: 'semanales', biweekly: 'quincenales', monthly: 'mensuales' }[freq] || 'semanales'
      : { weekly: 'weekly', biweekly: 'biweekly', monthly: 'monthly' }[freq] || 'weekly';
  };

  const buttonText = language === 'es'
    ? `Suscribirse a sesiones ${getFrequencyText()}`
    : `Subscribe to ${getFrequencyText()} sessions`;

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      // First, follow the instructor if not already following
      const { data: followData, error: followError } = await supabase
        .from('user_follows')
        .select('id')
        .eq('user_id', userId)
        .eq('follows_user_id', instructorId)
        .single();

      if (!followData && followError?.code !== 'PGRST116') {
        throw followError;
      }

      if (!followData) {
        const { error: insertError } = await supabase.from('user_follows').insert({
          user_id: userId,
          follows_user_id: instructorId,
        });

        if (insertError) throw insertError;
      }

      // Insert/update session subscription record
      const subscriptionData = {
        user_id: userId,
        session_id: sessionId,
        instructor_id: instructorId,
        is_subscription: true,
        recurrence_pattern: recurrencePattern,
        subscription_status: 'active',
      };

      const { error: subError } = await supabase
        .from('session_participants')
        .upsert(
          {
            ...subscriptionData,
            status: 'subscribed',
          },
          { onConflict: 'user_id,session_id' }
        );

      if (subError && subError.code !== 'PGRST116') {
        throw subError;
      }

      setSubscribed(true);
      setShowConfirm(false);
      const successMsg = language === 'es'
        ? 'Suscripción exitosa. Te añadiremos automáticamente a las próximas sesiones.'
        : 'Subscription successful! You\'ll be automatically added to future sessions.';
      showSuccess(successMsg);
    } catch (error: unknown) {
      console.error('Subscription error:', error);
      const errorMsg = language === 'es'
        ? 'Error al suscribirse. Por favor intenta de nuevo.'
        : 'Failed to subscribe. Please try again.';
      showError(errorMsg);
    } finally {
      setSubscribing(false);
    }
  };

  if (subscribed) {
    return (
      <Button disabled className="w-full py-2 font-semibold rounded-lg bg-tribe-green text-slate-900">
        {language === 'es' ? 'Suscrito' : 'Subscribed'}
      </Button>
    );
  }

  return (
    <>
      <Button
        onClick={() => setShowConfirm(true)}
        variant="outline"
        className="w-full py-2 font-semibold rounded-lg border-2 border-tribe-green text-tribe-green hover:bg-tribe-green hover:text-slate-900 transition-colors dark:border-tribe-green dark:text-tribe-green"
      >
        {buttonText}
      </Button>

      {/* Subscription Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={(open) => !open && setShowConfirm(false)}>
        <DialogContent data-modal="true" className="max-w-md rounded-xl p-6 bg-white dark:bg-[#6B7178]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-stone-900 dark:text-white">
              {language === 'es' ? 'Confirmar Suscripción' : 'Confirm Subscription'}
            </DialogTitle>
            <DialogDescription className="text-sm text-stone-600 dark:text-gray-300 mt-2">
              {language === 'es'
                ? 'Aquí está lo que sucederá cuando te suscribas'
                : 'Here\'s what happens when you subscribe'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Auto-booking info */}
            <div className="flex gap-3">
              <div className="text-tribe-green text-lg flex-shrink-0">✓</div>
              <div>
                <p className="font-semibold text-stone-900 dark:text-white text-sm">
                  {language === 'es' ? 'Reserva Automática' : 'Automatic Booking'}
                </p>
                <p className="text-xs text-stone-600 dark:text-gray-300 mt-1">
                  {language === 'es'
                    ? 'Serás añadido automáticamente a futuras sesiones de esta serie'
                    : 'You\'ll automatically be added to future sessions in this series'}
                </p>
              </div>
            </div>

            {/* Pricing info (if paid) */}
            {price && price > 0 && (
              <div className="flex gap-3">
                <div className="text-tribe-green text-lg flex-shrink-0">💰</div>
                <div>
                  <p className="font-semibold text-stone-900 dark:text-white text-sm">
                    {language === 'es' ? 'Costo por Sesión' : 'Cost Per Session'}
                  </p>
                  <p className="text-xs text-stone-600 dark:text-gray-300 mt-1">
                    {language === 'es'
                      ? `Serás cobrado ${price} ${currency} por cada sesión`
                      : `You'll be charged ${price} ${currency} per session`}
                  </p>
                </div>
              </div>
            )}

            {/* Anytime cancellation info */}
            <div className="flex gap-3">
              <div className="text-tribe-green text-lg flex-shrink-0">🔓</div>
              <div>
                <p className="font-semibold text-stone-900 dark:text-white text-sm">
                  {language === 'es' ? 'Desuscribirse en Cualquier Momento' : 'Unsubscribe Anytime'}
                </p>
                <p className="text-xs text-stone-600 dark:text-gray-300 mt-1">
                  {language === 'es'
                    ? 'Puedes cancelar tu suscripción desde tu perfil cuando quieras'
                    : 'You can cancel your subscription anytime from your profile'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={subscribing}
              className="flex-1 py-3 border-stone-300 dark:border-[#52575D] text-stone-900 dark:text-white font-semibold rounded-lg hover:bg-stone-100 dark:hover:bg-[#52575D]"
            >
              {language === 'es' ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button
              onClick={handleSubscribe}
              disabled={subscribing}
              className="flex-1 py-3 font-semibold rounded-lg bg-tribe-green text-slate-900 hover:bg-[#8FD642]"
            >
              {subscribing
                ? (language === 'es' ? 'Suscribiendo...' : 'Subscribing...')
                : (language === 'es' ? 'Confirmar' : 'Confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
