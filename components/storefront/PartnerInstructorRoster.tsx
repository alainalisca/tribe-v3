'use client';

import Link from 'next/link';
import type { PartnerInstructor } from '@/lib/dal/featuredPartners';

interface Props {
  instructors: PartnerInstructor[];
  language: string;
}

export default function PartnerInstructorRoster({ instructors, language }: Props) {
  if (instructors.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="text-sm font-bold text-stone-900 dark:text-white mb-2">
        {language === 'es' ? 'Nuestros Instructores' : 'Our Instructors'}
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {instructors.map((inst) => (
          <Link key={inst.id} href={`/storefront/${inst.instructor_id}`} className="flex-shrink-0 w-24 text-center">
            <div className="w-14 h-14 rounded-full bg-[#52575D] border-2 border-tribe-green mx-auto mb-1.5 overflow-hidden flex items-center justify-center">
              {inst.user?.avatar_url ? (
                <img src={inst.user.avatar_url} alt={inst.user.name || ''} className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg text-white font-bold">{(inst.user?.name || 'I')[0].toUpperCase()}</span>
              )}
            </div>
            <p className="text-xs font-semibold text-stone-900 dark:text-white truncate">
              {inst.user?.name || 'Instructor'}
            </p>
            <p className="text-[10px] text-stone-500 dark:text-[#B1B3B6] capitalize">{inst.role}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
