'use client';

import { useState } from 'react';
import { ShieldCheck, GraduationCap } from 'lucide-react';

interface CredentialsBadgesProps {
  certifications: string[];
  isVerified: boolean;
  language: 'en' | 'es';
}

/**
 * Verified badge + certification chips for a storefront.
 *
 * Certifications are instructor-authored free text and can be arbitrarily long
 * (some instructors paste several sentences into one entry). A collapsed chip
 * truncates to a single line within its column and never overflows; tapping it
 * expands to the full wrapped text, and a title attribute exposes the full text
 * on hover — so a long credential is bounded but never silently cut off.
 *
 * Years of experience is intentionally NOT shown here: it is the storefront
 * trust bar's "Years of experience" stat (StorefrontTrustBar), and rendering it
 * again as a chip duplicated it on the same screen.
 */
export default function CredentialsBadges({ certifications, isVerified, language }: CredentialsBadgesProps) {
  const certs = (certifications || []).filter((c) => !!c && c.trim().length > 0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (!isVerified && certs.length === 0) {
    return null;
  }

  function toggle(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const verifiedLabel = language === 'es' ? 'Instructor Verificado' : 'Verified Instructor';

  return (
    <div className="flex flex-wrap gap-2">
      {isVerified && (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-tribe-green/20 text-tribe-green text-xs font-semibold whitespace-nowrap">
          <ShieldCheck className="w-3.5 h-3.5" />
          {verifiedLabel}
        </span>
      )}
      {certs.map((cert, idx) => {
        const isOpen = expanded.has(idx);
        return (
          <button
            key={`${cert}-${idx}`}
            type="button"
            onClick={() => toggle(idx)}
            title={cert}
            aria-expanded={isOpen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-theme-card text-theme-secondary text-xs text-left max-w-full min-w-0"
          >
            <GraduationCap className="w-3.5 h-3.5 text-[#A3E635] flex-shrink-0" />
            <span className={`min-w-0 ${isOpen ? 'whitespace-normal break-words' : 'truncate'}`}>{cert}</span>
          </button>
        );
      })}
    </div>
  );
}
