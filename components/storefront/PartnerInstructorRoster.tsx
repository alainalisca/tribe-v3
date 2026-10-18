'use client';

import Link from 'next/link';
import UserAvatar from '@/components/UserAvatar';
import type { PartnerInstructor } from '@/lib/dal/featuredPartners';
import { useTranslations } from '@/lib/i18n/useTranslations';

interface Props {
  instructors: PartnerInstructor[];
}

export default function PartnerInstructorRoster({ instructors }: Props) {
  const t = useTranslations('partner');
  if (instructors.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="text-sm font-bold text-stone-900 dark:text-white mb-2">{t('ourCoaches')}</h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {instructors.map((inst) => (
          <Link key={inst.id} href={`/storefront/${inst.instructor_id}`} className="flex-shrink-0 w-24 text-center">
            <UserAvatar
              src={inst.user?.avatar_url}
              name={inst.user?.name || 'Instructor'}
              alt={inst.user?.name || 'Instructor avatar'}
              className="flex w-14 h-14 bg-tribe-mid dark:bg-tribe-mid border-2 border-tribe-green mx-auto mb-1.5"
              textClassName="text-lg text-white dark:text-white"
            />
            <p className="text-xs font-semibold text-stone-900 dark:text-white truncate">
              {inst.user?.name || 'Instructor'}
            </p>
            <p className="text-[10px] text-stone-500 dark:text-tribe-gray-60 capitalize">{inst.role}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
