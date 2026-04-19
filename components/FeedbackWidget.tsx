// components/FeedbackWidget.tsx
// ============================================================
// Floating action button + bottom-sheet feedback form.
// Appears on every page via the root layout. Adapted to use
// project conventions: Tailwind, useLanguage, useTheme, and
// the existing user_feedback table via /api/feedback/widget.
//
// Usage:
//   import FeedbackWidget from '@/components/FeedbackWidget';
//   <FeedbackWidget appVersion="2.5.0" />
// ============================================================

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { MessageSquare, X, Image as ImageIcon, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { FeedbackCategory, DeviceInfo, FeedbackSubmitPayload, FeedbackSubmitResponse } from '@/types/feedback';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FeedbackWidgetProps {
  /** Current app version string, e.g. "2.5.0" */
  appVersion?: string;
  /** Bottom offset in px to clear the tab bar. Default: 80 */
  bottomOffset?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------

function useWidgetTranslations() {
  const { language } = useLanguage();
  return language === 'es'
    ? {
        sendFeedback: 'Enviar comentario',
        category: 'Categoría',
        bug: 'Reporte de error',
        featureRequest: 'Idea de función',
        general: 'General',
        message: 'Mensaje',
        placeholder: 'Cuéntanos qué piensas...',
        minChars: `Mínimo ${MIN_MESSAGE_LENGTH} caracteres`,
        send: 'Enviar',
        sending: 'Enviando...',
        thanksTitle: '¡Gracias por tu comentario!',
        thanksSubtitle: 'Lo revisaremos pronto.',
        signInRequired: 'Inicia sesión para enviar comentarios.',
        networkError: 'Error de red. Revisa tu conexión e intenta de nuevo.',
        genericError: 'Algo salió mal. Intenta de nuevo.',
      }
    : {
        sendFeedback: 'Send feedback',
        category: 'Category',
        bug: 'Bug report',
        featureRequest: 'Feature idea',
        general: 'General',
        message: 'Message',
        placeholder: "Tell us what's on your mind...",
        minChars: `Minimum ${MIN_MESSAGE_LENGTH} characters`,
        send: 'Send feedback',
        sending: 'Sending...',
        thanksTitle: 'Thanks for your feedback!',
        thanksSubtitle: "We'll review it shortly.",
        signInRequired: 'Please sign in to submit feedback.',
        networkError: 'Network error. Please check your connection and try again.',
        genericError: 'Something went wrong. Please try again.',
      };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectDeviceInfo(): DeviceInfo {
  const isCapacitor = typeof window !== 'undefined' && 'Capacitor' in window;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
  const uaLower = ua.toLowerCase();

  let platform: 'ios' | 'android' | 'web' = 'web';
  if (uaLower.includes('iphone') || uaLower.includes('ipad')) platform = 'ios';
  else if (uaLower.includes('android')) platform = 'android';

  return {
    platform,
    userAgent: ua,
    screenWidth: typeof window !== 'undefined' ? window.screen.width : 0,
    screenHeight: typeof window !== 'undefined' ? window.screen.height : 0,
    nativePlatform: isCapacitor ? String((window as unknown as Record<string, unknown>).Capacitor) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CATEGORIES: { value: FeedbackCategory; labelKey: 'bug' | 'featureRequest' | 'general' }[] = [
  { value: 'bug', labelKey: 'bug' },
  { value: 'feature_request', labelKey: 'featureRequest' },
  { value: 'general', labelKey: 'general' },
];

export default function FeedbackWidget({ appVersion, bottomOffset = 80 }: FeedbackWidgetProps) {
  // Wait for client mount before rendering — ThemeProvider's context value
  // is only available after its own useEffect sets mounted=true, so we must
  // delay our first render to avoid calling useTheme() before that.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return <FeedbackWidgetInner appVersion={appVersion} bottomOffset={bottomOffset} />;
}

/** Inner component — only rendered after mount, so useTheme() is safe. */
function FeedbackWidgetInner({ appVersion, bottomOffset = 80 }: FeedbackWidgetProps) {
  const supabase = createClient();
  const { theme } = useTheme();
  const t = useWidgetTranslations();
  const isDark = theme === 'dark';

  // State
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset form when closing
  const resetForm = useCallback(() => {
    setCategory('bug');
    setMessage('');
    setSubmitState('idle');
    setErrorMessage('');
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(resetForm, 300);
  }, [resetForm]);

  // Auto-close after success
  useEffect(() => {
    if (submitState === 'success') {
      const timer = setTimeout(handleClose, 2000);
      return () => clearTimeout(timer);
    }
  }, [submitState, handleClose]);

  // Focus textarea when opening
  useEffect(() => {
    if (isOpen && submitState === 'idle') {
      const timer = setTimeout(() => textareaRef.current?.focus(), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, submitState]);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    const trimmed = message.trim();

    if (trimmed.length < MIN_MESSAGE_LENGTH) {
      setErrorMessage(t.minChars);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setErrorMessage(t.signInRequired);
        setIsSubmitting(false);
        return;
      }

      const payload: FeedbackSubmitPayload = {
        category,
        message: trimmed,
        deviceInfo: collectDeviceInfo(),
        appVersion,
      };

      // In dev, use the Next.js API route; in production (static export),
      // use the Supabase Edge Function.
      const isDev = process.env.NODE_ENV === 'development';
      const feedbackUrl = isDev
        ? '/api/feedback/widget'
        : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/feedback-widget`;

      const response = await fetch(feedbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      let result: FeedbackSubmitResponse;
      try {
        result = await response.json();
      } catch {
        // Response was not JSON (e.g. HTML error page)
        setErrorMessage(t.genericError);
        setSubmitState('error');
        return;
      }

      if (!response.ok || !result.success) {
        setErrorMessage(result.error ?? t.genericError);
        setSubmitState('error');
      } else {
        setSubmitState('success');
      }
    } catch {
      setErrorMessage(t.networkError);
      setSubmitState('error');
    } finally {
      setIsSubmitting(false);
    }
  }, [category, message, supabase, appVersion, t]);

  // Character count
  const charCount = message.length;
  const isOverLimit = charCount > MAX_MESSAGE_LENGTH;
  const isUnderMin = charCount > 0 && charCount < MIN_MESSAGE_LENGTH;

  return (
    <>
      {/* ── Floating Action Button ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label={t.sendFeedback}
          className="fixed z-[1000] flex items-center justify-center w-12 h-12 rounded-full
            bg-tribe-green shadow-lg transition-transform duration-200 hover:scale-105
            active:scale-95 border-none cursor-pointer"
          style={{ bottom: `${bottomOffset + 8}px`, right: '16px' }}
        >
          <MessageSquare className="w-5 h-5 text-tribe-dark" />
        </button>
      )}

      {/* ── Overlay ── */}
      {isOpen && (
        <div onClick={handleClose} className="fixed inset-0 z-[1001] bg-black/50 transition-opacity duration-300" />
      )}

      {/* ── Bottom Sheet ── */}
      <div
        className={`fixed left-0 right-0 z-[1002] rounded-t-2xl transition-all duration-300 ease-out
          ${isDark ? 'bg-tribe-dark' : 'bg-white'}
          ${isOpen ? 'bottom-0 opacity-100' : '-bottom-full opacity-0 pointer-events-none'}`}
        style={{ maxHeight: '85vh', overflowY: 'auto', padding: '0 16px 24px' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1.5">
          <div className={`w-9 h-1 rounded-full ${isDark ? 'bg-stone-600' : 'bg-stone-300'}`} />
        </div>

        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className={`text-base font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{t.sendFeedback}</h2>
          <button
            onClick={handleClose}
            aria-label="Close"
            className={`p-1 rounded-full transition-colors cursor-pointer
              ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-white/10' : 'text-gray-500 hover:text-gray-700 hover:bg-stone-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitState === 'success' ? (
          /* ── Success state ── */
          <div className="text-center py-8">
            <CheckCircle className="w-10 h-10 text-tribe-green mx-auto" />
            <p className={`text-sm font-medium mt-3 mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {t.thanksTitle}
            </p>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.thanksSubtitle}</p>
          </div>
        ) : (
          /* ── Form ── */
          <>
            {/* Category selector */}
            <p className={`text-xs mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.category}</p>
            <div className="flex gap-2 mb-4">
              {CATEGORIES.map((cat) => {
                const isActive = category === cat.value;
                return (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    className={`text-xs px-3.5 py-1.5 rounded-lg cursor-pointer transition-all duration-150 font-medium
                      ${
                        isActive
                          ? 'border border-tribe-green bg-tribe-green/15 text-tribe-green'
                          : isDark
                            ? 'border border-transparent bg-tribe-dark text-gray-400 hover:text-gray-300'
                            : 'border border-transparent bg-stone-100 text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    {t[cat.labelKey]}
                  </button>
                );
              })}
            </div>

            {/* Message textarea */}
            <div className="flex justify-between items-center mb-1">
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t.message}</p>
              {charCount > 0 && (
                <p
                  className={`text-xs ${
                    isOverLimit
                      ? 'text-tribe-red'
                      : isUnderMin
                        ? 'text-yellow-500'
                        : isDark
                          ? 'text-gray-600'
                          : 'text-gray-400'
                  }`}
                >
                  {charCount}/{MAX_MESSAGE_LENGTH}
                </p>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              placeholder={t.placeholder}
              maxLength={MAX_MESSAGE_LENGTH + 100}
              className={`w-full h-24 rounded-lg text-sm p-2.5 resize-none outline-none transition-colors
                ${
                  isDark
                    ? 'bg-tribe-dark text-white placeholder:text-gray-500'
                    : 'bg-stone-50 text-gray-900 placeholder:text-gray-400'
                }
                ${
                  errorMessage
                    ? 'border border-tribe-red'
                    : isDark
                      ? 'border border-tribe-surface focus:border-tribe-green'
                      : 'border border-gray-200 focus:border-tribe-green'
                }`}
            />

            {/* Error message */}
            {errorMessage && <p className="text-tribe-red text-xs mt-2">{errorMessage}</p>}

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isOverLimit}
              className={`w-full mt-3.5 py-3 rounded-xl text-sm font-medium transition-opacity duration-200 cursor-pointer
                bg-tribe-green text-tribe-dark
                ${isSubmitting ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90 active:opacity-80'}`}
            >
              {isSubmitting ? t.sending : t.send}
            </button>
          </>
        )}
      </div>
    </>
  );
}
