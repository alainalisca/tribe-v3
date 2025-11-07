'use client';

import Link from 'next/link';
import { Home, Calendar, Users, User, Plus } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';

interface BottomNavProps {
  activeTab?: 'home' | 'sessions' | 'matches' | 'profile' | 'create';
}

export default function BottomNav({ activeTab }: BottomNavProps) {
  const pathname = usePathname();
  const { t } = useLanguage();
  
  const isActive = (tab: string) => {
    if (activeTab) return activeTab === tab;
    
    if (tab === 'home') return pathname === '/';
    if (tab === 'sessions') return pathname === '/sessions';
    if (tab === 'matches') return pathname === '/matches';
    if (tab === 'profile') return pathname === '/profile';
    if (tab === 'create') return pathname === '/create';
    
    return false;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-tribe-dark border-t border-slate-700 z-50">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-around py-2">
          <Link href="/">
            <button className={`flex flex-col items-center p-2 rounded-lg transition ${
              isActive('home') ? 'text-tribe-green' : 'text-gray-400 hover:text-white'
            }`}>
              <Home className="w-6 h-6" />
              <span className="text-xs mt-1">{t('home')}</span>
            </button>
          </Link>

          <Link href="/sessions">
            <button className={`flex flex-col items-center p-2 rounded-lg transition ${
              isActive('sessions') ? 'text-tribe-green' : 'text-gray-400 hover:text-white'
            }`}>
              <Calendar className="w-6 h-6" />
              <span className="text-xs mt-1">{t('sessions')}</span>
            </button>
          </Link>

          <Link href="/create">
            <button className="flex flex-col items-center -mt-6">
              <div className={`p-4 rounded-full shadow-lg transition ${
                isActive('create') 
                  ? 'bg-lime-500' 
                  : 'bg-tribe-green hover:bg-lime-500'
              }`}>
                <Plus className="w-7 h-7 text-slate-900" strokeWidth={3} />
              </div>
              <span className={`text-xs mt-2 ${
                isActive('create') ? 'text-tribe-green' : 'text-gray-400'
              }`}>
                {t('create')}
              </span>
            </button>
          </Link>

          <Link href="/matches">
            <button className={`flex flex-col items-center p-2 rounded-lg transition ${
              isActive('matches') ? 'text-tribe-green' : 'text-gray-400 hover:text-white'
            }`}>
              <Users className="w-6 h-6" />
              <span className="text-xs mt-1">{t('matches')}</span>
            </button>
          </Link>

          <Link href="/profile">
            <button className={`flex flex-col items-center p-2 rounded-lg transition ${
              isActive('profile') ? 'text-tribe-green' : 'text-gray-400 hover:text-white'
            }`}>
              <User className="w-6 h-6" />
              <span className="text-xs mt-1">{t('profile')}</span>
            </button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
