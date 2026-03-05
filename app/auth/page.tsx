/** Page: /auth — Sign in, sign up, password reset with Google/Apple OAuth */
'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import LanguageToggle from '@/components/LanguageToggle';

import OAuthButtons from './OAuthButtons';
import ResetPasswordForm from './ResetPasswordForm';
import EmailAuthForm from './EmailAuthForm';
import { useAuthHandlers } from './useAuthHandlers';

export default function AuthPage() {
  const { language } = useLanguage();
  const h = useAuthHandlers(language);

  if (h.checkingAuth) {
    return (
      <div className="h-screen bg-stone-50 dark:bg-[#52575D]">
        <LoadingSpinner className="flex items-center justify-center h-screen" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute top-0 right-4 pt-4">
        <LanguageToggle />
      </div>

      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
        <div className="bg-white dark:bg-[#6B7178] rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-stone-900 dark:text-white mb-2">
              Tribe<span className="text-tribe-green">.</span>
            </h1>
            <p className="text-tribe-green font-semibold text-lg mb-2">{h.t.tagline}</p>
            <p className="text-stone-600 dark:text-gray-300">
              {h.isResetPassword ? h.t.resetPassword : h.isLogin ? h.t.welcomeBack : h.t.joinCommunity}
            </p>
          </div>

          {!h.isResetPassword && (
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-3 text-sm text-stone-600 dark:text-gray-300">
                <span className="text-xl flex-shrink-0">🏃</span>
                <span>
                  {language === 'es'
                    ? 'Encuentra compañeros para entrenar cerca de ti'
                    : 'Find workout partners near you'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-stone-600 dark:text-gray-300">
                <span className="text-xl flex-shrink-0">📅</span>
                <span>
                  {language === 'es' ? 'Crea y únete a sesiones de entrenamiento' : 'Create and join training sessions'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-stone-600 dark:text-gray-300">
                <span className="text-xl flex-shrink-0">💬</span>
                <span>
                  {language === 'es' ? 'Coordina con tu grupo en el chat' : 'Coordinate with your group in chat'}
                </span>
              </div>
            </div>
          )}

          {!h.isResetPassword && (
            <OAuthButtons
              t={h.t}
              appleLoading={h.appleLoading}
              googleLoading={h.googleLoading}
              loading={h.loading}
              onAppleSignIn={h.handleAppleSignIn}
              onGoogleSignIn={h.handleGoogleSignIn}
            />
          )}

          {h.isResetPassword ? (
            <ResetPasswordForm
              t={h.t}
              password={h.password}
              confirmPassword={h.confirmPassword}
              loading={h.loading}
              message={h.message}
              onPasswordChange={h.setPassword}
              onConfirmPasswordChange={h.setConfirmPassword}
              onSubmit={h.handleResetPassword}
            />
          ) : (
            <EmailAuthForm
              t={h.t}
              isLogin={h.isLogin}
              email={h.email}
              password={h.password}
              name={h.name}
              birthDate={h.birthDate}
              acceptedTos={h.acceptedTos}
              loading={h.loading}
              message={h.message}
              language={language}
              needsVerification={h.needsVerification}
              resendCooldown={h.resendCooldown}
              onEmailChange={h.setEmail}
              onPasswordChange={h.setPassword}
              onNameChange={h.setName}
              onBirthDateChange={h.setBirthDate}
              onAcceptedTosChange={h.setAcceptedTos}
              onSubmit={h.handleSubmit}
              onForgotPassword={h.handleForgotPassword}
              onResendVerification={h.handleResendVerification}
            />
          )}

          {!h.isResetPassword && (
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  h.setIsLogin(!h.isLogin);
                  h.setMessage('');
                }}
                className="text-sm text-tribe-green hover:underline"
              >
                {h.isLogin ? h.t.noAccount : h.t.hasAccount}
              </button>
            </div>
          )}

          <div className="mt-4 text-center">
            <Link href="/" className="text-sm text-stone-600 dark:text-gray-400 hover:text-tribe-green transition">
              {h.t.backHome}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
