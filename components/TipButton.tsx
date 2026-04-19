'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { createTip, createNotification } from '@/lib/dal';
import { showSuccess, showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { trackEvent } from '@/lib/analytics';
import { getPaymentGateway, type Currency } from '@/lib/payments/config';

interface TipButtonProps {
  tipperId: string;
  instructorId: string;
  instructorName: string;
  sessionId?: string;
  currency: Currency;
  language: 'en' | 'es';
  /** Render inline (no floating button) — used inside PostSessionFlow Step 6 */
  inline?: boolean;
  /** Called once a tip is recorded (pending or approved). */
  onTipped?: () => void;
}

const PRESETS: Record<Currency, number[]> = {
  COP: [5000, 10000, 20000],
  USD: [200, 500, 1000], // cents
};

function formatAmount(cents: number, currency: Currency, language: 'en' | 'es'): string {
  if (currency === 'COP') {
    return `$${Math.round(cents).toLocaleString(language === 'es' ? 'es-CO' : 'en-US')} COP`;
  }
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)} USD`;
}

const MAX_MESSAGE = 140;

export default function TipButton({
  tipperId,
  instructorId,
  instructorName,
  sessionId,
  currency,
  language,
  inline = false,
  onTipped,
}: TipButtonProps) {
  const supabase = createClient();
  const [open, setOpen] = useState(inline);
  const [selected, setSelected] = useState<number | null>(PRESETS[currency][1] ?? null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const t = {
    sayThanks: language === 'es' ? `Dale las gracias a ${instructorName}` : `Say thanks to ${instructorName}`,
    customLabel: language === 'es' ? 'Monto personalizado' : 'Custom amount',
    noteLabel: language === 'es' ? 'Agrega una nota (opcional)' : 'Add a note (optional)',
    goesTo: language === 'es' ? `100% va para ${instructorName}` : `100% goes to ${instructorName}`,
    send: language === 'es' ? 'Enviar Propina' : 'Send Tip',
    cancel: language === 'es' ? 'Cancelar' : 'Cancel',
    tip: language === 'es' ? 'Dar Propina' : 'Tip',
    thanks: language === 'es' ? `¡Alegraste el día de ${instructorName}!` : `You made ${instructorName}'s day!`,
    success: language === 'es' ? 'Propina enviada' : 'Tip sent',
    error: language === 'es' ? 'No se pudo enviar la propina' : 'Could not send tip',
    invalid: language === 'es' ? 'Monto no válido' : 'Invalid amount',
    placeholder: language === 'es' ? 'Gran sesión 🙌' : 'Great session! 🙌',
  };

  const effectiveAmount = (() => {
    if (customAmount) {
      const parsed = Number(customAmount.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(parsed) || parsed <= 0) return 0;
      return currency === 'USD' ? Math.round(parsed * 100) : Math.round(parsed);
    }
    return selected ?? 0;
  })();

  const handleSubmit = async () => {
    if (!effectiveAmount || effectiveAmount <= 0) {
      showError(t.invalid);
      return;
    }
    setSaving(true);
    const gateway = getPaymentGateway(currency);
    const res = await createTip(
      supabase,
      tipperId,
      instructorId,
      effectiveAmount,
      currency,
      gateway,
      sessionId,
      message.trim() || undefined
    );
    if (!res.success) {
      setSaving(false);
      showError(res.error || t.error);
      return;
    }

    // Fire-and-forget notification to instructor.
    const notifMsg =
      language === 'es'
        ? `Recibiste una propina de ${formatAmount(effectiveAmount, currency, 'es')}`
        : `You received a tip of ${formatAmount(effectiveAmount, currency, 'en')}`;
    await createNotification(supabase, {
      recipient_id: instructorId,
      actor_id: tipperId,
      type: 'tip_received',
      entity_type: 'tip',
      entity_id: res.data?.id ?? null,
      message: notifMsg,
    });

    trackEvent('tip_sent', {
      amount_cents: effectiveAmount,
      currency,
      instructor_id: instructorId,
      session_id: sessionId ?? null,
    });
    await haptic('success');
    showSuccess(t.success);
    setSuccess(true);
    setSaving(false);
    onTipped?.();
  };

  const renderPanel = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-theme-primary mb-2">{t.sayThanks}</h3>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS[currency].map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => {
                setSelected(amt);
                setCustomAmount('');
              }}
              className={`py-2 px-2 rounded-lg text-sm font-semibold transition-colors ${
                selected === amt && !customAmount
                  ? 'bg-[#84cc16] text-slate-900'
                  : 'bg-[#272D34] text-gray-200 hover:bg-[#404549]'
              }`}
            >
              {formatAmount(amt, currency, language)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1" htmlFor="tip-custom">
          {t.customLabel}
        </label>
        <input
          id="tip-custom"
          type="text"
          inputMode="decimal"
          value={customAmount}
          onChange={(e) => {
            setCustomAmount(e.target.value);
            setSelected(null);
          }}
          placeholder={currency === 'COP' ? '15000' : '7.50'}
          className="w-full px-3 py-2 rounded-lg bg-[#272D34] text-white text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1" htmlFor="tip-note">
          {t.noteLabel}
        </label>
        <textarea
          id="tip-note"
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
          rows={2}
          placeholder={t.placeholder}
          className="w-full px-3 py-2 rounded-lg bg-[#272D34] text-white text-sm resize-none"
        />
        <p className="text-[10px] text-gray-500 text-right">
          {message.length}/{MAX_MESSAGE}
        </p>
      </div>

      <p className="text-center text-xs font-semibold text-[#A3E635]">{t.goesTo}</p>

      <div className="flex gap-2">
        {!inline && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-[#272D34] text-gray-300 text-sm disabled:opacity-50"
          >
            {t.cancel}
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || success}
          className={`flex-1 py-2.5 rounded-lg bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-sm font-bold transition-colors disabled:opacity-50 ${
            inline ? '' : ''
          }`}
        >
          {saving ? '…' : success ? '✓' : t.send}
        </button>
      </div>

      {success && <p className="text-center text-sm text-[#A3E635] font-semibold animate-pulse">{t.thanks}</p>}
    </div>
  );

  if (inline) {
    return <div className="bg-[#3D4349] rounded-2xl p-4">{renderPanel()}</div>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#3D4349] hover:bg-[#404549] text-white text-sm font-semibold"
      >
        <Heart className="w-4 h-4 text-[#A3E635]" />
        {t.tip} {instructorName}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setOpen(false)}
        >
          <div className="w-full max-w-md bg-[#3D4349] rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            {renderPanel()}
          </div>
        </div>
      )}
    </>
  );
}
