'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Camera, Loader, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import StarRating from '@/components/StarRating';
import PostSessionConnect from '@/components/PostSessionConnect';
import { compressImage } from '@/components/stories/storyUploadHelpers';
import { insertRecapPhoto } from '@/lib/dal';
import { showSuccess, showError } from '@/lib/toast';
import { log } from '@/lib/logger';

interface PostSessionFlowProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  userId: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string | null;
  sport: string;
  participants: Array<{
    user_id: string;
    name: string;
    avatar_url: string | null;
    primary_sport?: string;
  }>;
  language: string;
  hasReviewed?: boolean;
}

const TOTAL_STEPS = 4;

export default function PostSessionFlow({
  open,
  onClose,
  sessionId,
  userId,
  creatorId,
  creatorName,
  creatorAvatar,
  sport: _sport,
  participants,
  language,
  hasReviewed = false,
}: PostSessionFlowProps) {
  const supabase = createClient();

  // If already reviewed, start at step 2 (Recap Photo)
  const [step, setStep] = useState(hasReviewed ? 2 : 1);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Recap photo state
  const [recapFile, setRecapFile] = useState<File | null>(null);
  const [recapPreview, setRecapPreview] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset step when hasReviewed changes
  useEffect(() => {
    if (hasReviewed && step === 1) {
      setStep(2);
    }
  }, [hasReviewed, step]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (recapPreview) URL.revokeObjectURL(recapPreview);
    };
  }, [recapPreview]);

  const t = (en: string, es: string): string => (language === 'es' ? es : en);

  // --- Step indicator ---
  function StepDots() {
    return (
      <div className="flex items-center justify-center gap-2 mb-6">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === step;
          const isCompleted = stepNum < step;
          return (
            <div
              key={stepNum}
              className={`w-2 h-2 rounded-full transition-colors ${
                isActive || isCompleted ? 'bg-tribe-green-light' : 'bg-stone-300 dark:bg-tribe-mid'
              }`}
            />
          );
        })}
      </div>
    );
  }

  // --- Step 1: Rate & Review ---
  async function handleSubmitReview() {
    if (rating === 0) {
      setReviewError(t('Select a rating to continue', 'Selecciona una calificacion para continuar'));
      return;
    }

    setIsSubmittingReview(true);
    setReviewError('');

    try {
      const { error } = await supabase.from('reviews').insert({
        session_id: sessionId,
        reviewer_id: userId,
        instructor_id: creatorId,
        rating,
        comment: reviewText.trim() || null,
      });

      if (error) {
        log('error', 'PostSessionFlow review insert failed', { error: error.message });
        setReviewError(t('Error submitting rating', 'Error al enviar calificacion'));
      } else {
        showSuccess(t('Rating submitted', 'Calificacion enviada'));
        setStep(2);
      }
    } catch (err) {
      log('error', 'PostSessionFlow review exception', { error: String(err) });
      setReviewError(t('Error submitting rating', 'Error al enviar calificacion'));
    } finally {
      setIsSubmittingReview(false);
    }
  }

  function renderRateStep() {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <h3 className="text-lg font-bold text-stone-900 dark:text-white">
            {t(`How was your session with ${creatorName}?`, `Como fue tu sesion con ${creatorName}?`)}
          </h3>
        </div>

        <div className="flex justify-center">
          <StarRating
            rating={rating}
            onRatingChange={(r) => {
              setRating(r);
              setReviewError('');
            }}
            size="lg"
          />
        </div>

        {reviewError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-xs rounded-lg p-2.5">
            {reviewError}
          </div>
        )}

        {rating > 0 && (
          <div>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder={t('Share your experience...', 'Comparte tu experiencia...')}
              maxLength={500}
              className="w-full h-20 p-3 rounded-xl text-sm resize-none outline-none transition-colors
                border border-gray-200 dark:border-gray-600 focus:border-tribe-green
                bg-gray-50 dark:bg-tribe-dark
                text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-gray-500"
            />
            <p className="text-xs text-stone-400 dark:text-gray-500 mt-1">{reviewText.length}/500</p>
          </div>
        )}

        <div className="space-y-2">
          <button
            onClick={handleSubmitReview}
            disabled={isSubmittingReview || rating === 0}
            className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
              ${
                isSubmittingReview || rating === 0
                  ? 'bg-tribe-green-light/50 text-stone-900 cursor-not-allowed'
                  : 'bg-tribe-green-light hover:bg-lime-500 text-stone-900 hover:scale-[1.02] active:scale-95'
              }
              flex items-center justify-center gap-2`}
          >
            {isSubmittingReview ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                {t('Submitting...', 'Enviando...')}
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                {t('Submit rating', 'Enviar calificacion')}
              </>
            )}
          </button>

          <button
            onClick={() => setStep(2)}
            className="w-full py-2.5 text-sm font-medium text-stone-500 dark:text-gray-400 hover:text-stone-700 dark:hover:text-gray-300 transition-colors"
          >
            {t('Skip', 'Omitir')}
          </button>
        </div>
      </div>
    );
  }

  // --- Step 2: Recap Photo ---
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showError(t('Invalid file type. Use JPG, PNG, or WebP.', 'Tipo de archivo no valido. Usa JPG, PNG o WebP.'));
      return;
    }

    if (recapPreview) URL.revokeObjectURL(recapPreview);
    setRecapFile(file);
    setRecapPreview(URL.createObjectURL(file));
  }

  async function handleUploadPhoto() {
    if (!recapFile) return;

    setIsUploadingPhoto(true);
    try {
      const compressedBlob = await compressImage(recapFile);
      const fileExt = recapFile.name.split('.').pop() || 'jpg';
      const fileName = `${userId}/${Date.now()}-recap-flow.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('session-photos').upload(fileName, compressedBlob, {
        cacheControl: '3600',
        upsert: false,
      });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('session-photos').getPublicUrl(fileName);

      const insertResult = await insertRecapPhoto(supabase, {
        session_id: sessionId,
        user_id: userId,
        photo_url: publicUrl,
      });

      if (!insertResult.success) throw new Error(insertResult.error);

      showSuccess(t('Photo uploaded!', 'Foto subida!'));
      setStep(3);
    } catch (err) {
      log('error', 'PostSessionFlow photo upload failed', { error: String(err) });
      showError(t('Error uploading photo', 'Error al subir foto'));
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function renderRecapPhotoStep() {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <h3 className="text-lg font-bold text-stone-900 dark:text-white">
            {t('Add a Recap Photo', 'Agrega una Foto del Resumen')}
          </h3>
          <p className="text-sm text-stone-500 dark:text-gray-400 mt-1">
            {t('Share a moment from your session', 'Comparte un momento de tu sesion')}
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />

        {recapPreview ? (
          <div className="relative">
            <img
              src={recapPreview}
              alt="Recap preview"
              className="w-full h-48 object-cover rounded-xl border border-gray-200 dark:border-gray-700"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors"
            >
              {t('Change', 'Cambiar')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl
              flex flex-col items-center justify-center gap-3
              hover:border-tribe-green hover:bg-tribe-green-light/5 transition-colors cursor-pointer"
          >
            <Camera className="w-10 h-10 text-stone-400 dark:text-gray-500" />
            <span className="text-sm font-medium text-stone-500 dark:text-gray-400">
              {t('Tap to add photo', 'Toca para agregar foto')}
            </span>
          </button>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setStep(3)}
            className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
              bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-gray-300
              hover:bg-stone-200 dark:hover:bg-stone-700"
          >
            {t('Skip', 'Omitir')}
          </button>

          {recapPreview && (
            <button
              onClick={handleUploadPhoto}
              disabled={isUploadingPhoto}
              className={`flex-1 py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
                flex items-center justify-center gap-2
                ${
                  isUploadingPhoto
                    ? 'bg-tribe-green-light/50 text-stone-900 cursor-not-allowed'
                    : 'bg-tribe-green-light hover:bg-lime-500 text-stone-900 hover:scale-[1.02] active:scale-95'
                }`}
            >
              {isUploadingPhoto ? <Loader className="w-4 h-4 animate-spin" /> : t('Next', 'Siguiente')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- Step 3: Connect with Athletes ---
  function renderConnectStep() {
    // Map participants to the format PostSessionConnect expects
    const connectParticipants = participants
      .filter((p) => p.user_id !== userId)
      .map((p) => ({
        id: p.user_id,
        name: p.name,
        avatar_url: p.avatar_url,
        sports: p.primary_sport ? [p.primary_sport] : [],
      }));

    return (
      <div className="space-y-5">
        {connectParticipants.length > 0 ? (
          <PostSessionConnect
            sessionId={sessionId}
            currentUserId={userId}
            participants={connectParticipants}
            language={language}
          />
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-stone-500 dark:text-gray-400">
              {t('No other athletes to connect with', 'Sin otros atletas para conectar')}
            </p>
          </div>
        )}

        <button
          onClick={() => setStep(4)}
          className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
            bg-tribe-green-light hover:bg-lime-500 text-stone-900 hover:scale-[1.02] active:scale-95"
        >
          {t('Next', 'Siguiente')}
        </button>
      </div>
    );
  }

  // --- Step 4: Train Again ---
  function renderTrainAgainStep() {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center text-center">
          {creatorAvatar ? (
            <img
              src={creatorAvatar}
              alt={creatorName}
              className="w-20 h-20 rounded-full object-cover border-3 border-tribe-green/50 mb-4"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-tribe-green-light/30 to-tribe-green-light/10 flex items-center justify-center border-3 border-tribe-green/50 mb-4">
              <span className="text-3xl font-bold text-tribe-green">{creatorName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <h3 className="text-lg font-bold text-stone-900 dark:text-white">
            {t('Train again?', 'Entrenar de nuevo?')}
          </h3>
        </div>

        <div className="space-y-3">
          <a
            href={`/storefront/${creatorId}`}
            className="block w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
              bg-tribe-green-light hover:bg-lime-500 text-stone-900 hover:scale-[1.02] active:scale-95 text-center"
          >
            {t(`Train with ${creatorName} again`, `Entrena con ${creatorName} de nuevo`)}
          </a>

          <Link
            href="/"
            className="block w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-200
              bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-gray-300
              hover:bg-stone-200 dark:hover:bg-stone-700 text-center"
          >
            {t('Find other sessions', 'Buscar otras sesiones')}
          </Link>

          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-medium text-stone-500 dark:text-gray-400 hover:text-stone-700 dark:hover:text-gray-300 transition-colors"
          >
            {t('Done', 'Listo')}
          </button>
        </div>
      </div>
    );
  }

  // --- Render current step ---
  function renderCurrentStep() {
    switch (step) {
      case 1:
        return renderRateStep();
      case 2:
        return renderRecapPhotoStep();
      case 3:
        return renderConnectStep();
      case 4:
        return renderTrainAgainStep();
      default:
        return null;
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent
        className="max-w-md bg-white dark:bg-tribe-dark border-gray-200 dark:border-gray-700 rounded-2xl p-6"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{t('Post-Session Flow', 'Flujo Post-Sesion')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('Rate, share photos, connect, and train again', 'Califica, comparte fotos, conecta y entrena de nuevo')}
        </DialogDescription>

        <StepDots />
        {renderCurrentStep()}
      </DialogContent>
    </Dialog>
  );
}
