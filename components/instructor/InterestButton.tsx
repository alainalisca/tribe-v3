'use client';

import { useEffect, useState } from 'react';
import { Dumbbell, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { expressInterest, withdrawInterest, hasExpressedInterest, createNotification } from '@/lib/dal';
import { sportTranslations } from '@/lib/translations';

interface InterestButtonProps {
  athleteId: string;
  instructorId: string;
  instructorName: string;
  specialties: string[];
  language: 'en' | 'es';
}

const MAX_MESSAGE = 200;

export default function InterestButton({
  athleteId,
  instructorId,
  instructorName,
  specialties,
  language,
}: InterestButtonProps) {
  const supabase = createClient();
  const [hasInterest, setHasInterest] = useState<boolean>(false);
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [sport, setSport] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setChecking(true);
      const res = await hasExpressedInterest(supabase, athleteId, instructorId);
      if (cancelled) return;
      setHasInterest(res.success ? !!res.data : false);
      setChecking(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [athleteId, instructorId, supabase]);

  const t = {
    title:
      language === 'es'
        ? `¿Interesado en entrenar con ${instructorName}?`
        : `Interested in training with ${instructorName}?`,
    subtext:
      language === 'es'
        ? `Hazle saber a ${instructorName} que te gustaría entrenar. Puede que te contacte con opciones de sesión.`
        : `Let ${instructorName} know you'd like to train. They may reach out with session options.`,
    interested: language === 'es' ? 'Estoy Interesado' : "I'm Interested",
    interestSent: language === 'es' ? 'Interés Enviado' : 'Interest Sent',
    withdraw: language === 'es' ? 'Retirar' : 'Withdraw',
    modalTitle: language === 'es' ? 'Enviar Interés' : 'Send Interest',
    sportLabel: language === 'es' ? 'Deporte' : 'Sport',
    sportPlaceholder: language === 'es' ? 'Elige un deporte' : 'Choose a sport',
    messageLabel: language === 'es' ? 'Mensaje (opcional)' : 'Message (optional)',
    messagePlaceholder:
      language === 'es' ? '¿Cuáles son tus objetivos de entrenamiento?' : 'What are your training goals?',
    send: language === 'es' ? 'Enviar Interés' : 'Send Interest',
    cancel: language === 'es' ? 'Cancelar' : 'Cancel',
    success:
      language === 'es'
        ? `¡Interés enviado! ${instructorName} verá tu perfil`
        : `Interest sent! ${instructorName} will see your profile`,
    withdrawn: language === 'es' ? 'Interés retirado' : 'Interest withdrawn',
    error: language === 'es' ? 'Ocurrió un error' : 'Something went wrong',
    notifTitleEn: `${instructorName ? 'Athlete' : 'Athlete'} is interested in training with you`,
  };

  const handleOpen = () => {
    setSport(specialties[0] || '');
    setMessage('');
    setOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    const res = await expressInterest(
      supabase,
      athleteId,
      instructorId,
      sport || undefined,
      message.trim() || undefined
    );
    if (!res.success) {
      setSaving(false);
      showError(res.error || t.error);
      return;
    }

    // Fire-and-forget notification; don't block UX on failure
    const notifMessage =
      language === 'es'
        ? 'Un atleta está interesado en entrenar contigo'
        : 'An athlete is interested in training with you';
    await createNotification(supabase, {
      recipient_id: instructorId,
      actor_id: athleteId,
      type: 'training_interest',
      entity_type: 'user',
      entity_id: athleteId,
      message: notifMessage,
    });

    await haptic('success');
    showSuccess(t.success);
    setHasInterest(true);
    setOpen(false);
    setSaving(false);
  };

  const handleWithdraw = async () => {
    setSaving(true);
    const res = await withdrawInterest(supabase, athleteId, instructorId);
    setSaving(false);
    if (!res.success) {
      showError(res.error || t.error);
      return;
    }
    setHasInterest(false);
    showSuccess(t.withdrawn);
  };

  if (checking) {
    return <div className="h-10" aria-hidden="true" />;
  }

  return (
    <>
      <div className="bg-[#3D4349] rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Dumbbell className="w-4 h-4 text-[#A3E635]" />
          <h3 className="text-sm font-semibold text-white">{t.title}</h3>
        </div>
        <p className="text-xs text-gray-400 mb-3">{t.subtext}</p>

        {hasInterest ? (
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-[#272D34] text-gray-400 text-sm font-semibold">
              <Check className="w-4 h-4" /> {t.interestSent}
            </div>
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={saving}
              className="w-full text-xs text-gray-500 hover:text-gray-300 disabled:opacity-50"
            >
              {t.withdraw}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleOpen}
            className="w-full py-2.5 px-4 rounded-lg bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-sm font-bold transition-colors"
          >
            {t.interested}
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md bg-[#3D4349] rounded-2xl p-5 border border-[#404549]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-4">{t.modalTitle}</h2>

            <label className="block text-xs text-gray-400 mb-1" htmlFor="interest-sport">
              {t.sportLabel}
            </label>
            <select
              id="interest-sport"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-lg bg-[#272D34] text-white text-sm"
            >
              <option value="">{t.sportPlaceholder}</option>
              {specialties.length > 0
                ? specialties.map((s) => (
                    <option key={s} value={s}>
                      {language === 'es' ? sportTranslations[s]?.es || s : sportTranslations[s]?.en || s}
                    </option>
                  ))
                : Object.keys(sportTranslations).map((s) => (
                    <option key={s} value={s}>
                      {language === 'es' ? sportTranslations[s].es : sportTranslations[s].en}
                    </option>
                  ))}
            </select>

            <label className="block text-xs text-gray-400 mb-1" htmlFor="interest-message">
              {t.messageLabel}
            </label>
            <textarea
              id="interest-message"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
              rows={3}
              placeholder={t.messagePlaceholder}
              className="w-full mb-1 px-3 py-2 rounded-lg bg-[#272D34] text-white text-sm resize-none"
            />
            <p className="text-[10px] text-gray-500 text-right mb-4">
              {message.length}/{MAX_MESSAGE}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-[#272D34] text-gray-300 text-sm hover:bg-[#404549] disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-sm font-bold disabled:opacity-50"
              >
                {saving ? '…' : t.send}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
