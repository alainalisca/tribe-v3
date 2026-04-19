'use client';

import { isPlus, type SubscriptionUserFields } from '@/lib/subscription/config';

interface TribePlusBadgeProps {
  user: SubscriptionUserFields | null | undefined;
  /** Optional: force show even if subscription is inactive (useful on marketing pages). */
  force?: boolean;
  className?: string;
}

/**
 * Renders a ✦ Tribe+ badge next to a user's name. Returns null for non-members
 * so it's safe to drop into any user row.
 */
export default function TribePlusBadge({ user, force = false, className = '' }: TribePlusBadgeProps) {
  if (!force && !isPlus(user)) return null;
  return (
    <span
      title="Tribe+"
      aria-label="Tribe Plus member"
      className={`inline-flex items-center justify-center w-4 h-4 rounded-sm bg-[#84cc16] text-slate-900 text-[10px] font-bold leading-none ${className}`}
    >
      ✦
    </span>
  );
}
