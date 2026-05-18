'use client';

import { Star, Clock, Calendar } from 'lucide-react';
import type { Instructor, Session } from '@/app/storefront/[id]/useStorefrontData';

interface StorefrontTrustBarProps {
  instructor: Instructor;
  sessions: Session[];
  language: 'en' | 'es';
  /** horizontal = mobile strip, vertical = desktop sidebar */
  orientation?: 'horizontal' | 'vertical';
}

/**
 * Trust bar (spec 6A/6B): Rating, Sessions Led, Years on Tribe.
 * Horizontal three-up strip on mobile, vertical stack in the desktop
 * sidebar. Theme tokens only.
 */
export default function StorefrontTrustBar({
  instructor,
  sessions,
  language,
  orientation = 'horizontal',
}: StorefrontTrustBarProps) {
  const hasReviews = (instructor.total_reviews ?? 0) > 0;
  const sessionsLed = instructor.total_sessions_hosted ?? sessions.length;
  const years = instructor.years_experience ?? 0;

  const items = [
    {
      icon: Star,
      value: hasReviews ? Number(instructor.average_rating ?? 0).toFixed(1) : '—',
      label: language === 'es' ? 'Calificación' : 'Rating',
    },
    {
      icon: Calendar,
      value: String(sessionsLed),
      label: language === 'es' ? 'Sesiones dirigidas' : 'Sessions led',
    },
    {
      icon: Clock,
      value: years > 0 ? String(years) : '—',
      label: language === 'es' ? 'Años de experiencia' : 'Years of experience',
    },
  ];

  const vertical = orientation === 'vertical';

  return (
    <div
      className={
        vertical
          ? 'flex flex-col divide-y divide-theme rounded-2xl bg-theme-card border border-theme'
          : 'grid grid-cols-3 gap-2'
      }
    >
      {items.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className={
            vertical
              ? 'flex items-center gap-3 px-4 py-3'
              : 'flex flex-col items-center text-center rounded-2xl bg-theme-card border border-theme p-3'
          }
        >
          <div className={vertical ? 'flex items-center gap-1.5' : 'flex items-center gap-1 mb-0.5'}>
            <Icon className="w-4 h-4 text-tribe-green flex-shrink-0" />
            <span className="text-lg font-bold text-theme-primary">{value}</span>
          </div>
          <p className="text-xs text-theme-secondary">{label}</p>
        </div>
      ))}
    </div>
  );
}
