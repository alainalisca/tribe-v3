'use client';

import { MotionConfig } from 'framer-motion';

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
 */
export default function ReducedMotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
