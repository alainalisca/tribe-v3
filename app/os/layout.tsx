'use client';

/**
 * Layout shell for every /os/* surface.
 *
 * Mounts <OSShell> so the persistent top navigation renders on
 * Dashboard, Clients, Revenue, Coaches, Gym settings, and any
 * future Tribe.OS surface. Page-level layout (max-width, padding,
 * H1 + subtitle) stays the responsibility of each page so we don't
 * have to refactor every existing one.
 */

import OSShell from '@/components/tribe-os/OSShell';

export default function OSLayout({ children }: { children: React.ReactNode }) {
  return <OSShell>{children}</OSShell>;
}
