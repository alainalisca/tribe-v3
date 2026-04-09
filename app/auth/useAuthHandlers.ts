/** Hook: useAuthHandlers — all auth state, effects, and handler functions */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { upsertUserProfile } from '@/lib/auth-helpers';
import { showError, showSuccess } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { logError } from '@/lib/logger';
import { getAuthTranslations } from './translations';

export function useAuthHandlers(language: 'en' | 'es') {
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode');
  const errorParam = searchParams.get('error');
  const router = useRouter();
  const supabase = createClient();
  const t = getAuthTranslations(language);

  const [isLogin, setIsLogin] = useState(true);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [acceptedTos, setAcceptedTos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  function getSafeReturnTo(): string {
    const returnTo = searchParams.get('returnTo');
    if (!returnTo) return '/';
    const decoded = decodeURIComponent(returnTo);
    return decoded.startsWith('/') && !decoded.startsWith('//') ? decoded : '/';
  }

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (user && !mode) router.replace('/');
        else setCheckingAuth(false);
      })
      .catch(() => setCheckingAuth(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only auth check
  }, []);

  useEffect(() => {
    if (mode === 'reset-password') setIsResetPassword(true);
  }, [mode]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (errorParam) {
      // Suppress transient OAuth errors that flash before successful redirect
      const transientErrors = ['server_error', 'temporarily_unavailable', 'access_denied'];
      const decoded = decodeURIComponent(errorParam);
      const isTransient = transientErrors.some((e) => decoded.toLowerCase().includes(e));
      if (!isTransient) {
        setMessage(language === 'es' ? `❌ Error de autenticación: ${decoded}` : `❌ Authentication error: ${decoded}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [errorParam]);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setMessage('');
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
        await GoogleAuth.initialize();
        const googleUser = await GoogleAuth.signIn();
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: googleUser.authentication.idToken,
        });
        if (error) throw error;
        if (data.user) {
          const { isNewUser } = await upsertUserProfile(data.user);
          window.location.href = isNewUser ? '/onboarding/role' : getSafeReturnTo();
        }
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(getSafeReturnTo())}`,
          },
        });
        if (error) throw error;
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as Record<string, unknown>).code;
        if (code === '12501' || code === 12501) {
          setGoogleLoading(false);
          return;
        }
      }
      if (
        err instanceof Error &&
        (err.message.includes('popup_closed') ||
          err.message.includes('cancelled') ||
          err.message.includes('canceled') ||
          err.message.includes('user denied'))
      ) {
        setGoogleLoading(false);
        return;
      }
      logError(err, { action: 'handleGoogleSignIn' });
      showError(getErrorMessage(err, 'google_sign_in', language));
      setGoogleLoading(false);
    }
  }

  async function handleAppleSignIn() {
    setAppleLoading(true);
    setMessage('');
    try {
      // Use web OAuth flow for all platforms (native plugin removed until Capacitor 8 support)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(getSafeReturnTo())}`,
        },
      });
      if (error) throw error;
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as Record<string, unknown>).code;
        if (code === '1001' || code === 1001) {
          setAppleLoading(false);
          return;
        }
      }
      if (err instanceof Error && (err.message.includes('cancelled') || err.message.includes('canceled'))) {
        setAppleLoading(false);
        return;
      }
      logError(err, { action: 'handleAppleSignIn' });
      showError(getErrorMessage(err, 'apple_sign_in', language));
      setAppleLoading(false);
    }
  }

  function calculateAge(bd: string): number {
    const today = new Date();
    const birth = new Date(bd);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.user?.email_confirmed_at) {
          setMessage(t.verifyEmail);
          setNeedsVerification(true);
          await supabase.auth.signOut();
          return;
        }
        window.location.href = getSafeReturnTo();
      } else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setMessage(t.invalidEmail);
          return;
        }
        if (!acceptedTos) {
          setMessage(t.mustAcceptTos);
          return;
        }
        if (!birthDate) {
          setMessage(t.enterBirthDate);
          return;
        }
        if (calculateAge(birthDate) < 18) {
          setMessage(t.mustBe18);
          return;
        }
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name, birthDate, acceptedTos, language }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setMessage(t.checkEmail);
        setEmail('');
        setPassword('');
        setName('');
        setBirthDate('');
      }
    } catch (error: unknown) {
      logError(error, { action: 'handleEmailAuth' });
      const context = isLogin ? 'login' : 'signup';
      setMessage('❌ ' + getErrorMessage(error, context, language));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setMessage(t.enterEmailFirst);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });
      if (error) throw error;
      setMessage(t.resetEmailSent);
    } catch (error: unknown) {
      logError(error, { action: 'handleForgotPassword' });
      setMessage('❌ ' + getErrorMessage(error, 'forgot_password', language));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (resendCooldown > 0 || !email) return;
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      showSuccess(t.verificationSent);
      setResendCooldown(60);
    } catch (error: unknown) {
      logError(error, { action: 'handleResendVerification' });
      showError(getErrorMessage(error, 'resend_verification', language));
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage(t.passwordsNoMatch);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage(t.passwordUpdated);
      setTimeout(() => router.push('/'), 2000);
    } catch (error: unknown) {
      logError(error, { action: 'handleResetPassword' });
      setMessage('❌ ' + getErrorMessage(error, 'reset_password', language));
    } finally {
      setLoading(false);
    }
  }

  return {
    t,
    isLogin,
    setIsLogin,
    isResetPassword,
    checkingAuth,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    name,
    setName,
    birthDate,
    setBirthDate,
    acceptedTos,
    setAcceptedTos,
    loading,
    appleLoading,
    googleLoading,
    message,
    setMessage,
    needsVerification,
    resendCooldown,
    handleGoogleSignIn,
    handleAppleSignIn,
    handleSubmit,
    handleForgotPassword,
    handleResetPassword,
    handleResendVerification,
  };
}
