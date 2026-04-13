'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AuthTranslations } from './translations';

interface EmailAuthFormProps {
  t: AuthTranslations;
  isLogin: boolean;
  email: string;
  password: string;
  name: string;
  birthDate: string;
  acceptedTos: boolean;
  loading: boolean;
  message: string;
  language: 'en' | 'es';
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onBirthDateChange: (v: string) => void;
  onAcceptedTosChange: (v: boolean) => void;
  needsVerification: boolean;
  resendCooldown: number;
  onSubmit: (e: React.FormEvent) => void;
  onForgotPassword: () => void;
  onResendVerification: () => void;
}

export default function EmailAuthForm({
  t,
  isLogin,
  email,
  password,
  name,
  birthDate,
  acceptedTos,
  loading,
  message,
  language,
  onEmailChange,
  onPasswordChange,
  onNameChange,
  onBirthDateChange,
  onAcceptedTosChange,
  needsVerification,
  resendCooldown,
  onSubmit,
  onForgotPassword,
  onResendVerification,
}: EmailAuthFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {!isLogin && (
        <>
          <div>
            <Label className="text-stone-700 dark:text-gray-300 mb-1.5">{t.name}</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t.namePlaceholder}
              required
              autoComplete="name"
              enterKeyHint="next"
              className="h-auto py-3 dark:border-[#52575D] focus:ring-tribe-green bg-white dark:bg-tribe-mid text-stone-900 dark:text-white"
            />
          </div>

          <div>
            <Label className="text-stone-700 dark:text-gray-300 mb-1.5">{t.birthDate}</Label>
            <Input
              type="date"
              value={birthDate}
              onChange={(e) => onBirthDateChange(e.target.value)}
              required
              max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
              className="h-auto py-3 dark:border-[#52575D] focus:ring-tribe-green bg-white dark:bg-tribe-mid text-stone-900 dark:text-white"
            />
            <p className="text-xs text-stone-500 dark:text-gray-400 mt-1">{t.mustBe18Note}</p>

            <div className="flex items-start gap-2 mt-4">
              <input
                type="checkbox"
                id="tos"
                checked={acceptedTos}
                onChange={(e) => onAcceptedTosChange(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-stone-300 text-tribe-green focus:ring-tribe-green"
              />
              <label htmlFor="tos" className="text-sm text-stone-600 dark:text-gray-300">
                {t.tosLabel}{' '}
                <Link href="/legal/terms" className="text-tribe-green hover:underline">
                  {t.termsOfService}
                </Link>{' '}
                {t.andThe}{' '}
                <Link href="/legal/privacy" className="text-tribe-green hover:underline">
                  {t.privacyPolicy}
                </Link>
              </label>
            </div>
          </div>
        </>
      )}

      <div>
        <Label className="text-stone-700 dark:text-gray-300 mb-1.5">{t.email}</Label>
        <Input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          required
          autoComplete="email"
          enterKeyHint="next"
          className="h-auto py-3 dark:border-[#52575D] focus:ring-tribe-green bg-white dark:bg-tribe-mid text-stone-900 dark:text-white"
        />
      </div>

      <div>
        <Label className="text-stone-700 dark:text-gray-300 mb-1.5">{t.password}</Label>
        <Input
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          minLength={6}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          enterKeyHint={isLogin ? 'go' : 'next'}
          className="h-auto py-3 dark:border-[#52575D] focus:ring-tribe-green bg-white dark:bg-tribe-mid text-stone-900 dark:text-white"
        />
        {!isLogin && password && (
          <div className="mt-2">
            <div className="w-full h-1.5 bg-stone-200 dark:bg-tribe-mid rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  password.length < 6
                    ? 'w-1/4 bg-red-500'
                    : password.length < 8 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)
                      ? 'w-2/4 bg-yellow-500'
                      : 'w-full bg-green-500'
                }`}
              />
            </div>
            <p
              className={`text-xs mt-1 ${
                password.length < 6
                  ? 'text-red-500'
                  : password.length < 8 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)
                    ? 'text-yellow-600'
                    : 'text-green-600'
              }`}
            >
              {password.length < 6
                ? language === 'es'
                  ? 'Muy corta'
                  : 'Too short'
                : password.length < 8 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)
                  ? language === 'es'
                    ? 'Débil'
                    : 'Weak'
                  : language === 'es'
                    ? 'Fuerte'
                    : 'Strong'}
            </p>
          </div>
        )}
        {isLogin && (
          <Button
            type="button"
            variant="link"
            onClick={onForgotPassword}
            disabled={loading}
            className="mt-2 text-sm text-tribe-green hover:underline disabled:opacity-50 p-0 h-auto"
          >
            {t.forgotPassword}
          </Button>
        )}
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

      {needsVerification && (
        <Button
          type="button"
          variant="outline"
          onClick={onResendVerification}
          disabled={resendCooldown > 0}
          className="w-full py-3 border-tribe-green text-tribe-green hover:bg-tribe-green hover:text-slate-900 font-semibold"
        >
          {resendCooldown > 0 ? `${t.resendIn} ${resendCooldown}s` : t.resendVerification}
        </Button>
      )}

      <Button type="submit" disabled={loading} className="w-full py-3 font-bold">
        {loading ? t.loading : isLogin ? t.signIn : t.signUp}
      </Button>
    </form>
  );
}
