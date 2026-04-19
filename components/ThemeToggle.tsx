'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg transition-all bg-stone-300 dark:bg-tribe-mid hover:ring-2 hover:ring-tribe-green-light"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun className="w-5 h-5 text-tribe-green-light" /> : <Moon className="w-5 h-5 text-tribe-dark" />}
    </button>
  );
}
