'use client';

import { domAnimation, LazyMotion, MotionConfig } from 'framer-motion';

/**
 * Makes every framer-motion element honour the OS "reduce motion" setting.
 *
 * `reducedMotion="user"` disables transform and layout animations while
 * leaving opacity alone, which is what the setting actually asks for: no
 * movement, but content still appears.
 *
 * A client wrapper because app/layout.tsx is a server component and
 * MotionConfig relies on context. One wrapper covers AnimatedCard,
 * PullToRefreshIndicator, OnboardingModal, the auth page and the
 * notifications page; PageTransition already handled it on its own.
 *
 * It also loads framer-motion's feature set lazily. Two of the seven
 * consumers live in the root layout, so the full `motion` bundle was landing
 * in the chunk every route pays for. None of the seven uses drag, layout
 * projection or pan, so `domAnimation` covers all of them.
 *
 * `strict` is deliberate: it makes any stray `motion.*` component throw
 * rather than silently re-importing the full bundle and quietly undoing this.
 * Consumers use `m.*` instead.
 */
export default function ReducedMotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
