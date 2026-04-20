'use client';

import { useState, useEffect } from 'react';
import { Heart, Share2, Check, Loader } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import StarRating from '@/components/StarRating';
import { logError } from '@/lib/logger';
import { showSuccess } from '@/lib/toast';
import { shareSession, type SessionShareData } from '@/lib/share';

interface PostSessionPromptProps {
  sessionId: string;
  instructorId: string;
  instructorName: string;
  instructorAvatar: string | null;
  userId: string;
  sport: string;
  onDismiss: () => void;
}

interface FollowState {
  isFollowing: boolean;
  isLoading: boolean;
}

export default function PostSessionPrompt({
  sessionId,
  instructorId,
  instructorName,
  instructorAvatar,
  userId,
  sport,
  onDismiss,
}: PostSessionPromptProps) {
  const supabase = createClient();
  const { language } = useLanguage();

  // State
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [showTextarea, setShowTextarea] = useState(false);
  const [followState, setFollowState] = useState<FollowState>({
    isFollowing: false,
    isLoading: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Translations
  const translations =
    language === 'es'
      ? {
          howWasSession: `¿Cómo fue tu sesión con ${instructorName}?`,
          shareExperience: 'Comparte tu experiencia...',
          follow: `Seguir a ${instructorName}`,
          following: 'Siguiendo',
          bookAgain: 'Reservar de nuevo',
          share: 'Compartir',
          submit: 'Enviar calificación',
          dismiss: 'Descartar',
          thankYou: '¡Gracias por tu calificación!',
          thankYouSubtitle: 'Tu opinión nos ayuda a mejorar',
          selectRating: 'Selecciona una calificación para continuar',
          followSuccess: 'Ahora sigues a ' + instructorName,
          followError: 'Error al seguir instructor',
          submitSuccess: 'Calificación enviada',
          submitError: 'Error al enviar calificación',
        }
      : {
          howWasSession: `How was your session with ${instructorName}?`,
          shareExperience: 'Share your experience...',
          follow: `Follow ${instructorName}`,
          following: 'Following',
          bookAgain: 'Book again',
          share: 'Share',
          submit: 'Submit rating',
          dismiss: 'Dismiss',
          thankYou: 'Thanks for rating!',
          thankYouSubtitle: 'Your feedback helps us improve',
          selectRating: 'Select a rating to continue',
          followSuccess: 'You now follow ' + instructorName,
          followError: 'Error following instructor',
          submitSuccess: 'Rating submitted',
          submitError: 'Error submitting rating',
        };

  // Check follow status on mount
  useEffect(() => {
    checkFollowStatus();
  }, []);

  const checkFollowStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', userId)
        .eq('following_id', instructorId)
        .maybeSingle();

      if (!error) {
        setFollowState((prev) => ({
          ...prev,
          isFollowing: !!data,
        }));
      }
    } catch (err) {
      logError(err, { action: 'checkFollowStatus' });
    }
  };

  const handleRatingSelect = (newRating: number) => {
    setRating(newRating);
    setShowTextarea(true);
    setErrorMessage('');
  };

  const handleFollowToggle = async () => {
    setFollowState((prev) => ({ ...prev, isLoading: true }));
    try {
      if (followState.isFollowing) {
        await supabase.from('user_follows').delete().eq('follower_id', userId).eq('following_id', instructorId);

        setFollowState((prev) => ({
          ...prev,
          isFollowing: false,
          isLoading: false,
        }));
      } else {
        await supabase.from('user_follows').insert({
          follower_id: userId,
          following_id: instructorId,
        });

        setFollowState((prev) => ({
          ...prev,
          isFollowing: true,
          isLoading: false,
        }));
      }
    } catch (err) {
      logError(err, { action: 'toggleFollow' });
      setFollowState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handleShare = async () => {
    const shareData: SessionShareData = {
      id: sessionId,
      title: sport,
      sport,
      date: new Date().toISOString().split('T')[0],
      instructorName,
    };
    const method = await shareSession(shareData, language);
    if (method === 'clipboard') {
      showSuccess(language === 'es' ? '¡Enlace copiado!' : 'Link copied!');
    }
  };

  const handleSubmitRating = async () => {
    if (rating === 0) {
      setErrorMessage(translations.selectRating);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // QA-08b: the `reviews` table column is `host_id`, not `instructor_id`.
      // Insert was silently failing before because the column name was wrong.
      const { error } = await supabase.from('reviews').insert({
        session_id: sessionId,
        reviewer_id: userId,
        host_id: instructorId,
        rating,
        comment: reviewText.trim() || null,
      });

      if (error) {
        // Keep full error context for diagnosis (code + message + details).
        logError(error, {
          action: 'submitReview',
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          sessionId,
          reviewerId: userId,
          hostId: instructorId,
        });
        setErrorMessage(translations.submitError);
        setSubmitState('error');
      } else {
        setSubmitState('success');
        // Auto-close after 2 seconds
        setTimeout(() => {
          onDismiss();
        }, 2000);
      }
    } catch (err) {
      logError(err, { action: 'submitReview', sessionId });
      setErrorMessage(translations.submitError);
      setSubmitState('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (submitState === 'success') {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none pb-24">
        <div className="w-full max-w-sm mx-auto px-4 pointer-events-auto">
          <div className="bg-white dark:bg-tribe-card rounded-2xl p-8 text-center shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="text-5xl mb-4 animate-bounce">🎉</div>
            <h3 className="text-lg font-bold text-stone-900 dark:text-white mb-2">{translations.thankYou}</h3>
            <p className="text-sm text-stone-600 dark:text-gray-400">{translations.thankYouSubtitle}</p>
          </div>
        </div>
      </div>
    );
  }

  // Main card
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 pointer-events-none pb-24">
      <div className="w-full max-w-sm mx-auto px-4 pointer-events-auto">
        <div className="bg-white dark:bg-tribe-card rounded-2xl p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
          {/* Instructor Avatar */}
          <div className="flex justify-center mb-5">
            {instructorAvatar ? (
              <img
                src={instructorAvatar}
                alt={instructorName}
                className="w-16 h-16 rounded-full object-cover border-3 border-tribe-green/50"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-tribe-green/30 to-tribe-green/10 flex items-center justify-center border-3 border-tribe-green/50">
                <span className="text-2xl font-bold text-tribe-green">{instructorName.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>

          {/* Title */}
          <h2 className="text-center text-lg font-bold text-stone-900 dark:text-white mb-5">
            {translations.howWasSession}
          </h2>

          {/* Star Rating */}
          <div className="flex justify-center mb-6">
            <StarRating rating={rating} onRatingChange={handleRatingSelect} size="lg" />
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="bg-tribe-red/10 border border-tribe-red text-tribe-red text-xs rounded-lg p-2.5 mb-4">
              {errorMessage}
            </div>
          )}

          {/* Review textarea (shows after rating selected) */}
          {showTextarea && (
            <div className="mb-5">
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder={translations.shareExperience}
                maxLength={500}
                className={`w-full h-20 p-3 rounded-xl text-sm resize-none outline-none transition-colors
                  ${
                    submitState === 'error'
                      ? 'border border-tribe-red'
                      : 'border border-gray-200 dark:border-gray-600 focus:border-tribe-green'
                  }
                  ${submitState === 'error' ? 'bg-tribe-red/5' : 'bg-stone-50 dark:bg-tribe-dark'}
                  text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-gray-500`}
              />
              <p className="text-xs text-stone-400 dark:text-gray-500 mt-1">{reviewText.length}/500</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3 mb-4">
            {/* Submit button */}
            {showTextarea && (
              <button
                onClick={handleSubmitRating}
                disabled={isSubmitting || rating === 0}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
                  ${
                    isSubmitting || rating === 0
                      ? 'bg-tribe-green/50 text-stone-900 cursor-not-allowed'
                      : 'bg-tribe-green hover:bg-lime-500 text-slate-900 hover:scale-[1.02] active:scale-95'
                  }
                  flex items-center justify-center gap-2`}
              >
                {isSubmitting ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    {language === 'es' ? 'Enviando...' : 'Submitting...'}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {translations.submit}
                  </>
                )}
              </button>
            )}

            {/* Follow button */}
            <button
              onClick={handleFollowToggle}
              disabled={followState.isLoading}
              className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2
                ${
                  followState.isFollowing
                    ? 'bg-stone-200 dark:bg-stone-700 text-stone-900 dark:text-white hover:bg-stone-300 dark:hover:bg-stone-600'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-white border border-tribe-green/50 hover:bg-tribe-green/10'
                }
                ${followState.isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-95'}`}
            >
              {followState.isLoading ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Heart className={`w-4 h-4 ${followState.isFollowing ? 'fill-current' : ''}`} />
              )}
              {followState.isFollowing ? translations.following : translations.follow}
            </button>

            {/* Book Again button */}
            <a
              href={`/storefront/${instructorId}`}
              className="block w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
                bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-white border border-stone-200 dark:border-stone-700
                hover:bg-stone-200 dark:hover:bg-stone-700 hover:scale-[1.02] active:scale-95 text-center"
            >
              {translations.bookAgain}
            </a>

            {/* Share button */}
            <button
              onClick={handleShare}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
                bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-white border border-stone-200 dark:border-stone-700
                hover:bg-stone-200 dark:hover:bg-stone-700 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              {translations.share}
            </button>
          </div>

          {/* Dismiss button */}
          {!showTextarea && (
            <button
              onClick={onDismiss}
              className="w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-colors
                text-stone-600 dark:text-gray-400 hover:text-stone-700 dark:hover:text-gray-300 hover:bg-stone-100 dark:hover:bg-stone-700"
            >
              {translations.dismiss}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
