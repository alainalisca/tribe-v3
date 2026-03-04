'use client';

import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { insertReview } from '@/lib/dal';
import StarRating from '@/components/StarRating';
import { useLanguage } from '@/lib/LanguageContext';

interface ReviewSectionProps {
  session: { id: string; creator_id: string };
  user: { id: string } | null;
  isCreator: boolean;
  hasJoined: boolean;
  isPast: boolean;
  hasReviewed: boolean;
  language: 'en' | 'es';
  onReviewSubmitted: () => void;
}

export default function ReviewSection({
  session,
  user,
  isCreator,
  hasJoined,
  isPast,
  hasReviewed,
  language,
  onReviewSubmitted,
}: ReviewSectionProps) {
  const { t } = useLanguage();
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  if (!user || !isPast || !hasJoined || isCreator || hasReviewed) return null;

  async function submitReview() {
    if (!user || !session || userRating === 0) return;

    try {
      setSubmittingReview(true);
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const result = await insertReview(supabase, {
        session_id: session.id,
        reviewer_id: user.id,
        host_id: session.creator_id,
        rating: userRating,
        comment: reviewComment.trim() || null,
      });

      if (!result.success) throw new Error(result.error);

      setShowRatingModal(false);
      showSuccess(t('thankYouForReview'));
      onReviewSubmitted();
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'send_message', language));
    } finally {
      setSubmittingReview(false);
    }
  }

  return (
    <>
      {/* Rate This Session Prompt */}
      <div className="bg-gradient-to-r from-yellow-400 to-orange-400 rounded-xl p-6 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
            <Star className="w-6 h-6 text-slate-900" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900 mb-1">{t('howWasSession')}</h3>
            <p className="text-sm text-slate-800">{t('feedbackHelpsOthers')}</p>
          </div>
          <button
            onClick={() => setShowRatingModal(true)}
            className="px-4 py-2 bg-white text-slate-900 font-bold rounded-lg hover:bg-stone-100 transition"
          >
            {t('rate')}
          </button>
        </div>
      </div>

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#6B7178] rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-theme-primary">{t('rateThisSession')}</h3>
              <button
                onClick={() => setShowRatingModal(false)}
                className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded"
              >
                <X className="w-5 h-5 text-theme-primary" />
              </button>
            </div>

            <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">{t('howWasYourExperience')}</p>

            <div className="flex justify-center mb-6">
              <StarRating rating={userRating} onRatingChange={setUserRating} size="lg" />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-theme-primary mb-2">{t('leaveAComment')}</label>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder={t('shareExperiencePlaceholder')}
                rows={3}
                className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary resize-none"
              />
            </div>

            <button
              onClick={submitReview}
              disabled={submittingReview || userRating === 0}
              className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submittingReview ? t('submitting') : t('submitReview')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
