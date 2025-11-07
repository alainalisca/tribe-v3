'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg transition-all bg-stone-300 dark:bg-[#52575D] hover:ring-2 hover:ring-[#C0E863]"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <Sun className="w-5 h-5 text-[#C0E863]" />
      ) : (
        <Moon className="w-5 h-5 text-[#272D34]" />
      )}
    </button>
  );
}
