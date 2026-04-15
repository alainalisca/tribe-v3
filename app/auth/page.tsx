/** Page: /auth — Sign in, sign up, password reset with Google/Apple OAuth */
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/lib/LanguageContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import LanguageToggle from '@/components/LanguageToggle';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { lookupReferralCode } from '@/lib/dal/referrals';

import OAuthButtons from './OAuthButtons';
import ResetPasswordForm from './ResetPasswordForm';
import EmailAuthForm from './EmailAuthForm';
import { useAuthHandlers } from './useAuthHandlers';

export default function AuthPage() {
  const { language } = useLanguage();
  const h = useAuthHandlers(language);
  const searchParams = useSearchParams();
  const [referrerName, setReferrerName] = useState<string | null>(null);

  // Capture referral code from URL and store in localStorage
  useEffect(() => {
    const refCode = searchParams.get('ref');
    if (!refCode) return;

    localStorage.setItem('tribe_referral_code', refCode);

    const supabase = createClient();
    lookupReferralCode(supabase, refCode).then((result) => {
      if (result.success && result.data) {
        setReferrerName(result.data.referrerName);
      }
    });
  }, [searchParams]);

  if (h.checkingAuth) {
    return (
      <div className="h-screen bg-stone-50 dark:bg-tribe-mid">
        <LoadingSpinner className="flex items-center justify-center h-screen" />
      </div>
    );
  }

  const isError = !!h.message && h.message.includes('❌');

  return (
    <div className="h-screen bg-stone-50 dark:bg-tribe-mid flex items-center justify-center p-4 overflow-hidden relative">
      {/* Atmospheric background image — sits behind the animated gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-30 dark:opacity-25"
        style={{ backgroundImage: 'url(/marketing/auth-bg.jpg)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-stone-50/90 via-stone-50/85 to-stone-50/90 dark:from-tribe-mid/90 dark:via-tribe-mid/85 dark:to-tribe-mid/90"
      />
      {/* Subtle animated gradient background */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-40"
        initial={{ backgroundPosition: '0% 50%' }}
        animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
        transition={{ duration: 18, ease: 'linear', repeat: Infinity }}
        style={{
          background:
            'linear-gradient(120deg, rgba(192,232,99,0.10) 0%, rgba(192,232,99,0) 30%, rgba(59,130,246,0.05) 60%, rgba(192,232,99,0.08) 100%)',
          backgroundSize: '200% 200%',
        }}
      />

      <div className="absolute top-0 right-4 pt-4 z-10">
        <LanguageToggle />
      </div>

      <motion.div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl relative z-10"
        animate={isError ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.45 }}
      >
        <Card className="rounded-2xl dark:bg-tribe-card shadow-xl border-none">
          <CardContent className="p-8">
            <div className="text-center mb-10">
              <h1 className="text-4xl font-extrabold tracking-tight text-stone-900 dark:text-white mb-2">
                Tribe<span className="text-tribe-green">.</span>
              </h1>
              <p className="text-tribe-green font-medium text-base mb-2">{h.t.tagline}</p>
              <h2 className="text-muted-foreground font-extrabold tracking-tight text-lg">
                {h.isResetPassword ? h.t.resetPassword : h.isLogin ? h.t.welcomeBack : h.t.joinCommunity}
              </h2>
            </div>

            <AnimatePresence>
              {referrerName && (
                <motion.div
                  key="referral-banner"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className="bg-tribe-green/10 border border-tribe-green/30 rounded-xl p-3 text-center mb-4"
                >
                  <p className="text-sm text-stone-900 dark:text-white">
                    {language === 'es' ? `🎉 Invitado por ${referrerName}` : `🎉 Invited by ${referrerName}`}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {!h.isResetPassword && (
              <OAuthButtons
                t={h.t}
                appleLoading={h.appleLoading}
                googleLoading={h.googleLoading}
                loading={h.loading}
                language={language}
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
              <div className="mt-8 text-center">
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
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
