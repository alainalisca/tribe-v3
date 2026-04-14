'use client';

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { haptic } from '@/lib/haptics';

interface ShareButtonProps {
  onShare: () => Promise<string | null>;
  size?: 'sm' | 'md';
  variant?: 'icon' | 'button';
  className?: string;
}

export default function ShareButton({ onShare, size = 'md', variant = 'icon', className = '' }: ShareButtonProps) {
  const { language } = useLanguage();
  const [shared, setShared] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();

    // Fire-and-forget haptic — don't await so the share sheet opens immediately
    haptic('light');

    try {
      const result = await onShare();
      // Only show "shared" confirmation if the share actually completed
      if (result !== null) {
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      // Share cancelled or failed — no action needed
    }
  }

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  if (variant === 'icon') {
    const padding = size === 'sm' ? 'p-1.5' : 'p-2';
    return (
      <button
        onClick={handleClick}
        className={`${padding} rounded-lg transition-colors ${
          shared
            ? 'bg-tribe-green/20 text-tribe-green'
            : 'hover:bg-stone-100 dark:hover:bg-tribe-mid text-stone-500 dark:text-gray-400'
        } ${className}`}
        aria-label={language === 'es' ? 'Compartir' : 'Share'}
      >
        {shared ? <Check className={iconSize} /> : <Share2 className={iconSize} />}
      </button>
    );
  }

  // Button variant
  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        shared
          ? 'bg-tribe-green/20 text-tribe-green'
          : 'hover:bg-stone-100 dark:hover:bg-tribe-mid text-stone-600 dark:text-gray-300'
      } ${className}`}
    >
      {shared ? <Check className={iconSize} /> : <Share2 className={iconSize} />}
      <span>{language === 'es' ? 'Compartir' : 'Share'}</span>
    </button>
  );
}
