/** Page: /subscriptions — My recurring session subscriptions */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock, MapPin, User, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import BottomNav from '@/components/BottomNav';
import { showSuccess, showError } from '@/lib/toast';
import { formatTime12Hour } from '@/lib/utils';
import { sportTranslations } from '@/lib/translations';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';

interface Subscription {
  session_id: string;
  session: {
    id: string;
    sport: string;
    date: string;
    start_time: string;
    duration: number;
    location: string;
    price_cents: number | null;
    currency: string | null;
    creator: {
      name: string;
      avatar_url: string | null;
    };
  };
  recurrence_pattern: string;
}

export default function SubscriptionsPage() {
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unsubscribeModal, setUnsubscribeModal] = useState<{
    isOpen: boolean;
    sessionId: string | null;
  }>({ isOpen: false, sessionId: null });
  const [unsubscribing, setUnsubscribing] = useState(false);

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  async function fetchSubscriptions() {
    try {
      setLoading(true);
      setError(null);

      // Get current user
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session?.user) {
        throw new Error(language === 'es' ? 'No autenticado' : 'Not authenticated');
      }

      const userId = sessionData.session.user.id;

      // Fetch subscriptions where user is subscribed to recurring sessions
      const { data, error: queryError } = await supabase
        .from('session_participants')
        .select(
          `
          user_id,
          session_id,
          is_subscription,
          recurrence_pattern,
          sessions (
            id,
            sport,
            date,
            start_time,
            duration,
            location,
            price_cents,
            currency,
            creator_id,
            users!creator_id (
              id,
              name,
              avatar_url
            )
          )
        `
        )
        .eq('user_id', userId)
        .eq('is_subscription', true);

      if (queryError) {
        throw queryError;
      }

      // Filter and map data
      const formattedData: Subscription[] = (data || [])
        .filter((item: any) => item.sessions && item.recurrence_pattern)
        .map((item: any) => ({
          session_id: item.session_id,
          session: {
            id: item.sessions.id,
            sport: item.sessions.sport,
            date: item.sessions.date,
            start_time: item.sessions.start_time,
            duration: item.sessions.duration,
            location: item.sessions.location,
            price_cents: item.sessions.price_cents,
            currency: item.sessions.currency,
            creator: {
              name: item.sessions.users?.[0]?.name || 'Unknown',
              avatar_url: item.sessions.users?.[0]?.avatar_url,
            },
          },
          recurrence_pattern: item.recurrence_pattern,
        }));

      setSubscriptions(formattedData);
    } catch (err) {
      console.error('Error fetching subscriptions:', err);
      setError(language === 'es' ? 'Error al cargar suscripciones' : 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsubscribe() {
    if (!unsubscribeModal.sessionId) return;

    setUnsubscribing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      if (!userId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('session_participants')
        .update({ is_subscription: false })
        .eq('user_id', userId)
        .eq('session_id', unsubscribeModal.sessionId);

      if (error) throw error;

      setSubscriptions((prev) => prev.filter((sub) => sub.session_id !== unsubscribeModal.sessionId));
      setUnsubscribeModal({ isOpen: false, sessionId: null });
      showSuccess(language === 'es' ? 'Suscripción cancelada' : 'Unsubscribed successfully');
    } catch (err) {
      console.error('Error unsubscribing:', err);
      showError(language === 'es' ? 'Error al desuscribirse' : 'Failed to unsubscribe');
    } finally {
      setUnsubscribing(false);
    }
  }

  const getFrequencyText = (pattern: string): string => {
    const freq = pattern?.split('_')[0] || 'weekly';
    return language === 'es'
      ? { weekly: 'Semanal', biweekly: 'Biweekly', monthly: 'Mensual' }[freq] || 'Semanal'
      : { weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly' }[freq] || 'Weekly';
  };

  const getNextSessionDate = (sessionDate: string, pattern: string): string => {
    const today = new Date();
    const sessionDateTime = new Date(sessionDate + 'T00:00:00');

    if (sessionDateTime >= today) {
      return sessionDateTime.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    }

    const freq = pattern?.split('_')[0] || 'weekly';
    const daysToAdd = freq === 'biweekly' ? 14 : freq === 'monthly' ? 30 : 7;
    const nextDate = new Date(sessionDateTime);
    nextDate.setDate(nextDate.getDate() + daysToAdd);

    return nextDate.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Link href="/profile">
            <Button variant="ghost" size="icon" className="mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">
            {language === 'es' ? 'Mis Suscripciones' : 'My Subscriptions'}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="pt-header max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tribe-green"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-stone-600 dark:text-gray-300 mb-4">{error}</p>
            <Button onClick={fetchSubscriptions} className="bg-tribe-green text-slate-900">
              {language === 'es' ? 'Reintentar' : 'Retry'}
            </Button>
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">📭</div>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
              {language === 'es' ? 'Sin Suscripciones' : 'No Subscriptions Yet'}
            </h2>
            <p className="text-sm text-stone-600 dark:text-gray-300 mb-6">
              {language === 'es'
                ? 'Suscríbete a sesiones recurrentes para entrenar regularmente con el mismo instructor.'
                : 'Subscribe to recurring sessions to train regularly with the same instructor.'}
            </p>
            <Link href="/">
              <Button className="bg-tribe-green text-slate-900 font-semibold">
                {language === 'es' ? 'Explorar Sesiones' : 'Explore Sessions'}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {subscriptions.map((subscription) => {
              const sportName =
                language === 'es' && sportTranslations[subscription.session.sport]
                  ? sportTranslations[subscription.session.sport].es
                  : subscription.session.sport;

              const price =
                subscription.session.price_cents && subscription.session.price_cents > 0
                  ? formatPrice(subscription.session.price_cents, (subscription.session.currency || 'USD') as Currency)
                  : null;

              return (
                <Card
                  key={subscription.session_id}
                  className="dark:bg-tribe-card shadow-none hover:shadow-sm transition-shadow duration-200 overflow-hidden border-stone-200 dark:border-[#52575D]"
                >
                  <CardContent className="p-5">
                    {/* Sport & Frequency Badge */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex gap-2">
                        <span className="inline-block px-4 py-2 bg-tribe-green text-slate-900 rounded-full text-sm font-bold">
                          {sportName}
                        </span>
                        <Badge className="bg-stone-200 dark:bg-tribe-mid text-stone-900 dark:text-white rounded-full border-transparent">
                          {getFrequencyText(subscription.recurrence_pattern)}
                        </Badge>
                      </div>
                    </div>

                    {/* Instructor Info */}
                    <div className="flex items-center gap-2 mb-3">
                      <Avatar className="w-6 h-6">
                        <AvatarImage
                          src={subscription.session.creator.avatar_url || undefined}
                          alt={subscription.session.creator.name}
                        />
                        <AvatarFallback className="bg-tribe-green text-slate-900 font-bold text-xs">
                          {subscription.session.creator.name?.[0]?.toUpperCase() || 'I'}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-xs text-stone-600 dark:text-[#B1B3B6]">
                        {language === 'es' ? 'Instructor: ' : 'Instructor: '}
                        <span className="font-semibold text-stone-900 dark:text-white">
                          {subscription.session.creator.name}
                        </span>
                      </p>
                    </div>

                    {/* Date & Time */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center text-muted-foreground">
                        <Calendar className="w-4 h-4 mr-2" />
                        <span className="text-sm font-medium">
                          {language === 'es' ? 'Próxima: ' : 'Next: '}
                          {getNextSessionDate(subscription.session.date, subscription.recurrence_pattern)}
                        </span>
                      </div>

                      <div className="flex items-center text-muted-foreground">
                        <Clock className="w-4 h-4 mr-2" />
                        <span className="text-sm">
                          {formatTime12Hour(subscription.session.start_time)} • {subscription.session.duration} min
                        </span>
                      </div>
                    </div>

                    {/* Location */}
                    <div className="flex items-start mb-3">
                      <MapPin className="w-4 h-4 mr-2 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">{subscription.session.location}</span>
                    </div>

                    {/* Price Info */}
                    {price && (
                      <div className="mb-4 p-3 bg-stone-50 dark:bg-tribe-mid rounded-lg">
                        <p className="text-xs font-semibold text-stone-700 dark:text-gray-300">
                          {language === 'es' ? 'Costo por sesión: ' : 'Cost per session: '}
                          <span className="text-tribe-green font-bold">{price}</span>
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Link href={`/session/${subscription.session_id}`} className="flex-1">
                        <Button
                          variant="outline"
                          className="w-full py-2 font-semibold text-sm border-stone-300 dark:border-[#52575D] text-stone-900 dark:text-white rounded-lg hover:bg-stone-100 dark:hover:bg-tribe-mid"
                        >
                          {language === 'es' ? 'Ver Detalles' : 'View Details'}
                        </Button>
                      </Link>
                      <Button
                        onClick={() =>
                          setUnsubscribeModal({
                            isOpen: true,
                            sessionId: subscription.session_id,
                          })
                        }
                        variant="ghost"
                        className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Unsubscribe Confirmation Modal */}
      <Dialog
        open={unsubscribeModal.isOpen}
        onOpenChange={(open) => {
          if (!open) setUnsubscribeModal({ isOpen: false, sessionId: null });
        }}
      >
        <DialogContent data-modal="true" className="max-w-sm rounded-xl p-6 bg-white dark:bg-tribe-card">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-red-600">
              {language === 'es' ? 'Cancelar Suscripción' : 'Cancel Subscription'}
            </DialogTitle>
            <DialogDescription className="text-sm text-stone-600 dark:text-gray-300 mt-2">
              {language === 'es'
                ? 'Dejarás de recibir invitaciones automáticas a futuras sesiones.'
                : 'You will no longer receive automatic invitations to future sessions.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setUnsubscribeModal({ isOpen: false, sessionId: null })}
              disabled={unsubscribing}
              className="flex-1 py-2.5 border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-700 dark:text-gray-300 hover:bg-stone-100 dark:hover:bg-tribe-mid font-medium"
            >
              {language === 'es' ? 'Cancelar' : 'Cancel'}
            </button>
            <button
              onClick={handleUnsubscribe}
              disabled={unsubscribing}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {unsubscribing
                ? language === 'es'
                  ? 'Cancelando...'
                  : 'Unsubscribing...'
                : language === 'es'
                  ? 'Desuscribirse'
                  : 'Unsubscribe'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
