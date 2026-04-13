/** Page: /payment/confirm — Post-payment landing page */
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';

type PaymentState = 'loading' | 'approved' | 'pending' | 'failed';

export default function PaymentConfirmPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { language } = useLanguage();
  const [state, setState] = useState<PaymentState>('loading');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionSport, setSessionSport] = useState<string>('');

  const paymentId = searchParams.get('payment_id');
  const gateway = searchParams.get('gateway');

  useEffect(() => {
    if (!paymentId) {
      setState('failed');
      return;
    }

    async function checkPaymentStatus() {
      const supabase = createClient();

      // Poll payment status (webhook may not have arrived yet)
      let attempts = 0;
      const maxAttempts = 10;
      const pollInterval = 2000; // 2 seconds

      const poll = async () => {
        attempts++;

        const { data: payment } = await supabase
          .from('payments')
          .select('id, status, session_id')
          .eq('id', paymentId)
          .single();

        if (!payment) {
          if (attempts >= maxAttempts) setState('failed');
          else setTimeout(poll, pollInterval);
          return;
        }

        setSessionId(payment.session_id);

        // Fetch session sport for display
        const { data: session } = await supabase.from('sessions').select('sport').eq('id', payment.session_id).single();
        if (session) setSessionSport(session.sport);

        if (payment.status === 'approved') {
          setState('approved');
        } else if (payment.status === 'declined' || payment.status === 'error' || payment.status === 'voided') {
          setState('failed');
        } else if (attempts >= maxAttempts) {
          // Still processing after max attempts — show pending state
          setState('pending');
        } else {
          setTimeout(poll, pollInterval);
        }
      };

      poll();
    }

    checkPaymentStatus();
  }, [paymentId]);

  const t = (en: string, es: string) => (language === 'es' ? es : en);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
      <div className="max-w-md mx-auto pt-20 px-6">
        {state === 'loading' && (
          <div className="text-center space-y-4">
            <Loader2 className="w-16 h-16 text-tribe-green mx-auto animate-spin" />
            <h1 className="text-xl font-bold text-stone-900 dark:text-white">
              {t('Verifying payment...', 'Verificando pago...')}
            </h1>
            <p className="text-stone-500 dark:text-gray-400">
              {t('Please wait while we confirm your payment.', 'Por favor espera mientras confirmamos tu pago.')}
            </p>
          </div>
        )}

        {state === 'approved' && (
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
              {t('Payment Confirmed!', '¡Pago Confirmado!')}
            </h1>
            <p className="text-stone-600 dark:text-gray-300">
              {t(
                `You're all set for ${sessionSport || 'your session'}. See you there!`,
                `Todo listo para ${sessionSport || 'tu sesión'}. ¡Nos vemos!`
              )}
            </p>
            {sessionId && (
              <Link
                href={`/session/${sessionId}`}
                className="inline-block mt-4 px-8 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
              >
                {t('View Session', 'Ver Sesión')}
              </Link>
            )}
          </div>
        )}

        {state === 'pending' && (
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto">
              <Clock className="w-12 h-12 text-amber-600" />
            </div>
            <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
              {t('Payment Processing', 'Pago en Proceso')}
            </h1>
            <p className="text-stone-600 dark:text-gray-300">
              {t(
                "Your payment is being processed. This may take a few minutes. You'll receive a notification when it's confirmed.",
                'Tu pago está siendo procesado. Esto puede tomar unos minutos. Recibirás una notificación cuando se confirme.'
              )}
            </p>
            {sessionId && (
              <Link
                href={`/session/${sessionId}`}
                className="inline-block mt-4 px-8 py-3 bg-stone-200 dark:bg-stone-700 text-stone-900 dark:text-white font-bold rounded-lg hover:bg-stone-300 dark:hover:bg-stone-600 transition"
              >
                {t('Back to Session', 'Volver a la Sesión')}
              </Link>
            )}
          </div>
        )}

        {state === 'failed' && (
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="w-12 h-12 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('Payment Failed', 'Pago Fallido')}</h1>
            <p className="text-stone-600 dark:text-gray-300">
              {t(
                'Something went wrong with your payment. No charges were made. Please try again.',
                'Algo salió mal con tu pago. No se realizó ningún cobro. Por favor intenta de nuevo.'
              )}
            </p>
            {sessionId ? (
              <Link
                href={`/session/${sessionId}`}
                className="inline-block mt-4 px-8 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
              >
                {t('Try Again', 'Intentar de Nuevo')}
              </Link>
            ) : (
              <Link
                href="/"
                className="inline-block mt-4 px-8 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
              >
                {t('Go Home', 'Ir al Inicio')}
              </Link>
            )}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
