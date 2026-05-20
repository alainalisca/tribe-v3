'use client';

/**
 * WhatsNewBadge — a small "✨ NEW" button that appears in the home header
 * when the signed-in user has a release_notes row they haven't dismissed.
 *
 * Tap the button → bottom sheet slides up with the changelog. Dismissing the
 * sheet (X, overlay tap, swipe-down, or "Got it") marks the release as seen
 * via `users.last_seen_release` AND hides the button. Nothing renders when
 * there's no unseen release.
 *
 * Why a button and not an auto-popup: the original auto-popup competed with
 * toasts, the iOS install prompt, notification permission requests, and
 * normal page transitions — users often couldn't tap the sheet before
 * something else stole focus. A header button is discoverable, user-paced,
 * and reuses the same sheet UI for the actual content.
 *
 * Suppressed when the user's profile is still incomplete AND they haven't
 * dismissed the OnboardingModal — the modal needs to finish first. Mirrors
 * the isProfileComplete check in useHomeFeed.ts.
 *
 * Per Claude_Code_Whats_New_Spec.md (with header-button UX swap, 2026-05-20).
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { haptic } from '@/lib/haptics';
import { logError } from '@/lib/logger';
import {
  getLatestReleaseNote,
  getUserLastSeenRelease,
  markReleaseSeen,
  type ReleaseNote,
} from '@/lib/dal/releaseNotes';

type LoadState = { kind: 'loading' } | { kind: 'no-release' } | { kind: 'unseen'; userId: string; note: ReleaseNote };

const ENTER_MS = 300;
const EXIT_MS = 250;

export default function WhatsNewBadge() {
  const { language } = useLanguage();
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragDelta = useRef<number>(0);

  // Bootstrap: figure out if there's an unseen release for this user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoadState({ kind: 'no-release' });
          return;
        }

        const [latestResult, lastSeenResult, profileProbe] = await Promise.all([
          getLatestReleaseNote(supabase),
          getUserLastSeenRelease(supabase, user.id),
          supabase.from('users').select('avatar_url, sports').eq('id', user.id).maybeSingle(),
        ]);

        if (cancelled) return;

        // Suppress while new-user onboarding is still in progress. Profile-
        // complete OR explicit OnboardingModal dismissal counts as "ready".
        const flagSet = typeof window !== 'undefined' && !!window.localStorage.getItem(`hasSeenOnboarding_${user.id}`);
        const profile = profileProbe.data as { avatar_url: string | null; sports: string[] | null } | null;
        const profileComplete = !!profile?.avatar_url && (profile?.sports?.length ?? 0) > 0;
        if (!flagSet && !profileComplete) {
          setLoadState({ kind: 'no-release' });
          return;
        }

        if (!latestResult.success || !latestResult.data) {
          setLoadState({ kind: 'no-release' });
          return;
        }

        const note = latestResult.data;
        const lastSeen = lastSeenResult.success ? (lastSeenResult.data ?? null) : null;
        if (lastSeen === note.version) {
          setLoadState({ kind: 'no-release' });
          return;
        }

        setLoadState({ kind: 'unseen', userId: user.id, note });
      } catch (error) {
        logError(error, { action: 'WhatsNewBadge.bootstrap' });
        if (!cancelled) setLoadState({ kind: 'no-release' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function persistSeen(note: ReleaseNote, userId: string) {
    try {
      const supabase = createClient();
      const result = await markReleaseSeen(supabase, userId, note.version);
      if (!result.success) {
        logError(new Error(result.error ?? 'markReleaseSeen failed'), {
          action: 'WhatsNewBadge.markReleaseSeen',
          userId,
          version: note.version,
        });
      }
    } catch (error) {
      logError(error, { action: 'WhatsNewBadge.markReleaseSeen', userId, version: note.version });
    }
  }

  function dismiss() {
    if (loadState.kind !== 'unseen' || closing) return;
    setClosing(true);
    void haptic('light');
    void persistSeen(loadState.note, loadState.userId);
    setTimeout(() => {
      setSheetOpen(false);
      setClosing(false);
      setLoadState({ kind: 'no-release' });
    }, EXIT_MS);
  }

  // Swipe-down dismiss on the sheet.
  function onTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
    dragDelta.current = 0;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (dragStartY.current == null || !sheetRef.current) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) {
      dragDelta.current = delta;
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }
  function onTouchEnd() {
    if (sheetRef.current) sheetRef.current.style.transform = '';
    const delta = dragDelta.current;
    dragStartY.current = null;
    dragDelta.current = 0;
    if (delta > 80) dismiss();
  }

  // Loading/no-release: render nothing (the badge is opt-in based on data).
  if (loadState.kind === 'loading' || loadState.kind === 'no-release') return null;

  const { note } = loadState;
  const title = language === 'es' ? note.title_es : note.title;
  const bullets = language === 'es' ? note.bullets_es : note.bullets;
  const dismissLabel = language === 'es' ? 'Entendido' : 'Got it';
  const closeAria = language === 'es' ? 'Cerrar' : 'Close';
  const buttonAria = language === 'es' ? 'Ver novedades' : 'See what’s new';

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label={buttonAria}
        title={buttonAria}
        className="relative w-10 h-10 flex items-center justify-center rounded-full bg-tribe-green/20 hover:bg-tribe-green/30 transition-colors"
      >
        <Sparkles className="w-5 h-5 text-tribe-green-dark" />
        {/* Animated lime dot draws the eye without being noisy */}
        <span
          className="absolute top-1 right-1 w-2 h-2 rounded-full bg-tribe-green ring-2 ring-stone-200 dark:ring-tribe-dark animate-pulse"
          aria-hidden="true"
        />
      </button>

      {sheetOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          // Portaled to document.body so the sheet escapes FilterBar's
          // stacking context (FilterBar is fixed top-0 z-40, BottomNav is
          // fixed bottom-0 z-50, so a sheet inside FilterBar can never
          // visually beat BottomNav no matter how high its z-index is).
          <div
            className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 transition-opacity ${
              closing ? 'opacity-0' : 'opacity-100'
            }`}
            style={{ transitionDuration: `${closing ? EXIT_MS : ENTER_MS}ms` }}
            onClick={dismiss}
            role="dialog"
            aria-modal="false"
            aria-labelledby="whats-new-title"
          >
            <div className="absolute inset-0 bg-black/30" aria-hidden="true" />

            <div
              ref={sheetRef}
              onClick={(e) => e.stopPropagation()}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              className={`relative w-full max-w-md bg-theme-card rounded-t-2xl sm:rounded-2xl shadow-xl px-6 py-4 max-h-[80vh] overflow-y-auto ${
                closing ? 'translate-y-full sm:translate-y-0 sm:opacity-0' : 'translate-y-0 opacity-100'
              } transition-all`}
              style={{
                transitionDuration: `${closing ? EXIT_MS : ENTER_MS}ms`,
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center -mt-1 mb-3">
                <div className="w-10 h-1 rounded-full bg-stone-300 dark:bg-tribe-mid" aria-hidden="true" />
              </div>

              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 id="whats-new-title" className="text-lg font-bold text-theme-primary">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label={closeAria}
                  className="p-1 -m-1 rounded-full text-theme-secondary hover:text-theme-primary transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {note.image_url && (
                <div className="relative w-full aspect-video mb-4 rounded-xl overflow-hidden bg-stone-100 dark:bg-tribe-mid">
                  <Image src={note.image_url} alt="" fill className="object-cover" unoptimized />
                </div>
              )}

              <ul className="space-y-2.5 mb-5">
                {bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-theme-secondary">
                    <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-tribe-green/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-tribe-green" strokeWidth={3} />
                    </span>
                    <span className="flex-1">{b}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={dismiss}
                className="w-full py-3 rounded-xl bg-tribe-green text-slate-900 font-bold hover:bg-lime-500 transition"
              >
                {dismissLabel}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
