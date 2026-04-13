'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
        <Label className="text-stone-700 dark:text-gray-300 mb-2">{t.newPassword}</Label>
        <Input
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          enterKeyHint="next"
          className="h-auto py-3 dark:border-[#52575D] focus:ring-tribe-green bg-white dark:bg-tribe-mid text-stone-900 dark:text-white"
        />
      </div>

      <div>
        <Label className="text-stone-700 dark:text-gray-300 mb-2">{t.confirmPassword}</Label>
        <Input
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => onConfirmPasswordChange(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
          enterKeyHint="go"
          className="h-auto py-3 dark:border-[#52575D] focus:ring-tribe-green bg-white dark:bg-tribe-mid text-stone-900 dark:text-white"
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
