'use client';

import { ShieldCheck, GraduationCap, Clock } from 'lucide-react';

interface CredentialsBadgesProps {
  certifications: string[];
  isVerified: boolean;
  yearsExperience: number;
  language: 'en' | 'es';
}

export default function CredentialsBadges({
  certifications,
  isVerified,
  yearsExperience,
  language,
}: CredentialsBadgesProps) {
  const certs = (certifications || []).filter((c) => !!c && c.trim().length > 0);

  if (!isVerified && certs.length === 0 && (yearsExperience ?? 0) <= 0) {
    return null;
  }

  const verifiedLabel = language === 'es' ? 'Instructor Verificado' : 'Verified Instructor';
  const yearsLabel =
    language === 'es'
      ? `${yearsExperience} año${yearsExperience === 1 ? '' : 's'} de experiencia`
      : `${yearsExperience} year${yearsExperience === 1 ? '' : 's'} experience`;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 md:flex-wrap md:overflow-visible">
      {isVerified && (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-tribe-green/20 text-tribe-green text-xs font-semibold whitespace-nowrap">
          <ShieldCheck className="w-3.5 h-3.5" />
          {verifiedLabel}
        </span>
      )}
      {certs.map((cert, idx) => (
        <span
          key={`${cert}-${idx}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3D4349] text-gray-200 text-xs whitespace-nowrap"
        >
          <GraduationCap className="w-3.5 h-3.5 text-[#A3E635]" />
          {cert}
        </span>
      ))}
      {yearsExperience > 0 && (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#3D4349] text-gray-200 text-xs whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 text-[#A3E635]" />
          {yearsLabel}
        </span>
      )}
    </div>
  );
}
