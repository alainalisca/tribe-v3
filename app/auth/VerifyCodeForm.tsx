'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AuthTranslations } from './translations';

interface VerifyCodeFormProps {
  t: AuthTranslations;
  email: string;
  code: string;
  loading: boolean;
  message: string;
  resendCooldown: number;
  onCodeChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onResend: () => void;
  onBack: () => void;
}

export default function VerifyCodeForm({
  t,
  email,
  code,
  loading,
  message,
  resendCooldown,
  onCodeChange,
  onSubmit,
  onResend,
  onBack,
}: VerifyCodeFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-gray-300">{t.verifyInstructions(email)}</p>

      <div>
        <Label className="text-stone-700 dark:text-gray-300 mb-1.5">{t.codeLabel}</Label>
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          // Strip non-digits so paste and autofill stay numeric.
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder={t.codePlaceholder}
          required
          enterKeyHint="go"
          className="h-auto py-3 text-center text-2xl tracking-[0.5em] dark:border-tribe-mid focus:ring-tribe-green bg-white dark:bg-tribe-mid text-stone-900 dark:text-white"
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

      <Button type="submit" disabled={loading || code.length < 6} className="w-full py-3 font-bold">
        {loading ? t.loading : t.verifyButton}
      </Button>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="link"
          onClick={onBack}
          disabled={loading}
          className="text-sm text-stone-600 dark:text-gray-400 hover:underline p-0 h-auto"
        >
          {t.useDifferentEmail}
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={onResend}
          disabled={resendCooldown > 0}
          className="text-sm text-tribe-green hover:underline disabled:opacity-50 p-0 h-auto"
        >
          {resendCooldown > 0 ? `${t.resendIn} ${resendCooldown}s` : t.resendCode}
        </Button>
      </div>
    </form>
  );
}
