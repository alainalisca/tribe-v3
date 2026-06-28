'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  showPasswordLabel: string;
  hidePasswordLabel: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  enterKeyHint?: 'go' | 'next' | 'done' | 'search' | 'send' | 'enter';
  children?: React.ReactNode;
}

export default function PasswordInput({
  label,
  value,
  onChange,
  showPasswordLabel,
  hidePasswordLabel,
  placeholder = '••••••••',
  required,
  minLength,
  autoComplete,
  enterKeyHint,
  children,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <Label className="text-stone-700 dark:text-gray-300 mb-1.5">{label}</Label>
      <div className="relative">
        <Input
          type={showPassword ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          enterKeyHint={enterKeyHint}
          className="h-auto py-3 pr-10 dark:border-tribe-mid focus:ring-tribe-green bg-white dark:bg-tribe-mid text-stone-900 dark:text-white"
        />
        <button
          type="button"
          aria-label={showPassword ? hidePasswordLabel : showPasswordLabel}
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
          tabIndex={-1}
        >
          {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      {children}
    </div>
  );
}
