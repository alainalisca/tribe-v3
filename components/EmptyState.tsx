'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/**
 * UI-L01: shared empty-state component for data-driven list pages.
 * Replaces the common pattern of rendering nothing when an array is empty —
 * users were seeing blank pages and assuming the app was broken.
 */
interface EmptyStateProps {
  Icon: LucideIcon;
  title: string;
  subtitle?: string;
  cta?: { label: string; href: string };
  className?: string;
}

export default function EmptyState({ Icon, title, subtitle, cta, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-16 min-h-[40vh] ${className}`}>
      <div className="w-14 h-14 rounded-full bg-stone-100 dark:bg-tribe-surface flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-stone-400 dark:text-gray-500" />
      </div>
      <p className="text-base font-semibold text-theme-primary">{title}</p>
      {subtitle && <p className="text-sm text-theme-secondary mt-2 max-w-xs leading-relaxed">{subtitle}</p>}
      {cta && (
        <Link
          href={cta.href}
          className="mt-5 inline-flex items-center px-4 py-2 rounded-xl bg-tribe-green text-slate-900 text-sm font-bold hover:bg-tribe-green-light transition-colors"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
