'use client';

import { Button } from '@/components/ui/button';
import type { AuthTranslations } from './translations';

interface ResetPasswordFormProps {
  t: AuthTranslations;
  password: string;
  confirmPassword: string;
  loading: boolean;
  message: string;
  onPasswordChange: (v: string) => void;
  onConfirmPasswordChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function ResetPasswordForm({
  t,
  password,
  confirmPassword,
  loading,
  message,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
}: ResetPasswordFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">{t.newPassword}</label>
        <input
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          enterKeyHint="next"
          className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg focus:ring-2 focus:ring-tribe-green focus:border-transparent bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">{t.confirmPassword}</label>
        <input
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => onConfirmPasswordChange(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          enterKeyHint="go"
          className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg focus:ring-2 focus:ring-tribe-green focus:border-transparent bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
        />
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.includes('✅')
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
          }`}
        >
          {message}
        </div>
      )}

      <Button type="submit" disabled={loading} className="w-full py-3 font-bold">
        {loading ? t.loading : t.updatePassword}
      </Button>
    </form>
  );
}
