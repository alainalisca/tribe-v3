'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { haptic } from '@/lib/haptics';

export default function BottomNav() {
  const pathname = usePathname();
  const { t, language } = useLanguage();
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Check for unread DMs
  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function checkUnread() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      // Get conversations with unread messages
      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id);

      if (!participants || participants.length === 0) return;

      let unread = 0;
      for (const p of participants) {
        const { count } = await supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', p.conversation_id)
          .gt('created_at', p.last_read_at || '1970-01-01')
          .neq('user_id', user.id);
        if (count && count > 0) unread++;
      }
      if (mounted) setUnreadMessages(unread);
    }

    checkUnread();
    const interval = setInterval(checkUnread, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // T-POLISH1: four tabs for everyone. Crear lives at the top of Mis sesiones;
  // Comunidad lost its tab (communities are frozen, /communities still works).
  // `match` lists the paths that keep a tab lit besides its own href.
  const navItems: Array<{
    href: string;
    label: string;
    icon: ReactNode;
    badge?: number;
    match?: string[];
  }> = [
    {
      href: '/',
      label: t('navExplore'),
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" strokeWidth={2} />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
        </svg>
      ),
    },
    {
      href: '/sessions',
      label: t('navMySessions'),
      match: ['/sessions', '/create', '/requests', '/my-training'],
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
    },
    {
      href: '/messages',
      label: language === 'es' ? 'Mensajes' : 'Messages',
      badge: unreadMessages,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      ),
    },
    {
      href: '/profile',
      label: t('profile'),
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      ),
    },
  ];

  // Height comes from --bottom-nav-h, the single definition in globals.css.
  // This used .safe-area-bottom directly, which meant the floating CTA and the
  // page clearance each re-derived the nav height independently -- and one of
  // them lost the 34px floor, so the nav covered the CTA by exactly 34px.
  return (
    <nav
      style={{ height: 'var(--bottom-nav-h)' }}
      className="fixed bottom-0 left-0 right-0 bg-white dark:bg-tribe-card border-t border-gray-200 dark:border-tribe-mid shadow-lg z-50"
    >
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center h-16 px-4">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname?.startsWith(item.href)) ||
              (item.match ?? []).some((m) => pathname === m || pathname?.startsWith(`${m}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => haptic('light')}
                className={`flex flex-col items-center justify-center min-w-0 flex-1 transition-colors relative ${
                  isActive
                    ? 'text-tribe-green'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  {item.icon}
                  {item.badge != null && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] mt-0.5 text-center leading-tight ${isActive ? 'font-semibold' : 'font-medium'}`}
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
