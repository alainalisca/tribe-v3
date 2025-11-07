'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Users, User, Plus } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

export default function BottomNav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  const navItems = [
    { href: '/', icon: Home, label: t('home') },
    { href: '/sessions', icon: Calendar, label: t('mySessions') },
    { href: '/create', icon: Plus, label: t('create'), isCreate: true },
    { href: '/matches', icon: Users, label: t('myTribe') },
    { href: '/profile', icon: User, label: t('profile') },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-stone-200 dark:bg-[#272D34] border-t border-stone-300 dark:border-black z-50">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            if (item.isCreate) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center"
                >
                  <div className="w-14 h-14 -mt-6 bg-tribe-green rounded-full flex items-center justify-center shadow-lg hover:opacity-90 transition">
                    <Icon className="w-7 h-7 text-slate-900" />
                  </div>
                  <span className="text-xs mt-1 text-tribe-green font-medium">
                    {item.label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center py-2 px-3 min-w-[60px]"
              >
                <Icon
                  className={`w-6 h-6 ${
                    isActive ? 'text-tribe-green' : 'text-stone-600 dark:text-gray-400'
                  }`}
                />
                <span
                  className={`text-xs mt-1 ${
                    isActive ? 'text-tribe-green font-semibold' : 'text-stone-600 dark:text-gray-400'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
