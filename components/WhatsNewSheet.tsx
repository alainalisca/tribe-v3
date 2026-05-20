'use client';

/**
 * WhatsNewSheet — bottom sheet that appears once per release version.
 *
 * On mount it fetches the latest release_notes row and the user's
 * users.last_seen_release. If the latest version doesn't match what the
 * user has seen, the sheet slides up. Dismiss (X / overlay tap / Got it /
 * swipe-down) persists the version to last_seen_release so it never shows
 * again for that release.
 *
 * Suppressed while the new-user onboarding modal is up (localStorage key
 * `hasSeenOnboarding_{userId}`) — onboarding takes priority over release
 * notes for first-time users.
 *
 * Per Claude_Code_Whats_New_Spec.md.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
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

type State =
  | { kind: 'idle' }
  | { kind: 'hidden' }
  | { kind: 'visible'; userId: string; note: ReleaseNote }
  | { kind: 'closing'; userId: string; note: ReleaseNote };

const ENTER_MS = 300;
const EXIT_MS = 250;

export default function WhatsNewSheet() {
  const { language } = useLanguage();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragDelta = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) {
          if (!cancelled) setState({ kind: 'hidden' });
          return;
        }

        // Suppress while new-user onboarding is still up. The real
        // "onboarding complete" signal lives in useHomeFeed.ts:
        //   isProfileComplete = avatar_url && sports.length > 0
        // The localStorage `hasSeenOnboarding_{userId}` flag only gets set
        // when a user explicitly dismisses the OnboardingModal — established
        // users (who joined before the modal existed, or whose profile was
        // already complete) never trigger it. So treat "profile complete OR
        // localStorage flag set" as "onboarding done, ok to show the sheet."
        const [latestResult, lastSeenResult, profileProbe] = await Promise.all([
          getLatestReleaseNote(supabase),
          getUserLastSeenRelease(supabase, user.id),
          supabase.from('users').select('avatar_url, sports').eq('id', user.id).maybeSingle(),
        ]);

        if (cancelled) return;

        const flagSet = typeof window !== 'undefined' && !!window.localStorage.getItem(`hasSeenOnboarding_${user.id}`);
        const profile = profileProbe.data as { avatar_url: string | null; sports: string[] | null } | null;
        const profileComplete = !!profile?.avatar_url && (profile?.sports?.length ?? 0) > 0;
        if (!flagSet && !profileComplete) {
          setState({ kind: 'hidden' });
          return;
        }

        if (!latestResult.success || !latestResult.data) {
          setState({ kind: 'hidden' });
          return;
        }

        const note = latestResult.data;
        const lastSeen = lastSeenResult.success ? (lastSeenResult.data ?? null) : null;

        if (lastSeen === note.version) {
          setState({ kind: 'hidden' });
          return;
        }

        setState({ kind: 'visible', userId: user.id, note });
      } catch (error) {
        logError(error, { action: 'WhatsNewSheet.bootstrap' });
        if (!cancelled) setState({ kind: 'hidden' });
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  async function close(note: ReleaseNote, userId: string) {
    if (state.kind !== 'visible') return;
    setState({ kind: 'closing', userId, note });
    void haptic('light');

    try {
      const supabase = createClient();
      const result = await markReleaseSeen(supabase, userId, note.version);
      if (!result.success) {
        logError(new Error(result.error ?? 'markReleaseSeen failed'), {
          action: 'WhatsNewSheet.markReleaseSeen',
          userId,
          version: note.version,
        });
      }
    } catch (error) {
      logError(error, { action: 'WhatsNewSheet.markReleaseSeen', userId, version: note.version });
    }

    setTimeout(() => setState({ kind: 'hidden' }), EXIT_MS);
  }

  // Swipe-down dismiss on the sheet itself.
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
    if (delta > 80 && state.kind === 'visible') {
      close(state.note, state.userId);
    }
  }

  if (state.kind === 'idle' || state.kind === 'hidden') return null;

  const { note, userId } = state;
  const closing = state.kind === 'closing';
  const title = language === 'es' ? note.title_es : note.title;
  const bullets = language === 'es' ? note.bullets_es : note.bullets;
  const dismissLabel = language === 'es' ? 'Entendido' : 'Got it';
  const closeAria = language === 'es' ? 'Cerrar' : 'Close';

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-end justify-center transition-opacity ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ transitionDuration: `${closing ? EXIT_MS : ENTER_MS}ms` }}
      onClick={() => close(note, userId)}
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
        className={`relative w-full max-w-md bg-theme-card rounded-t-2xl shadow-xl px-6 py-4 max-h-[70vh] overflow-y-auto ${
          closing ? 'translate-y-full' : 'translate-y-0'
        } transition-transform`}
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
            onClick={() => close(note, userId)}
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
          onClick={() => close(note, userId)}
          className="w-full py-3 rounded-xl bg-tribe-green text-slate-900 font-bold hover:bg-lime-500 transition"
        >
          {dismissLabel}
        </button>
      </div>
    </div>
  );
}
