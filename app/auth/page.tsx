/** Page: /auth — Sign in, sign up, password reset with Google/Apple OAuth */
'use client';

import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import LanguageToggle from '@/components/LanguageToggle';
import { upsertUserProfile } from '@/lib/auth-helpers';
import { showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { logError } from '@/lib/logger';

export default function AuthPage() {
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode');
  const errorParam = searchParams.get('error');
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
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();

  // If user is already authenticated, redirect to home
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (user && !mode) {
          router.replace('/');
        } else {
          setCheckingAuth(false);
        }
      })
      .catch(() => setCheckingAuth(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only auth check
  }, []);

  useEffect(() => {
    if (mode === 'reset-password') {
      setIsResetPassword(true);
    }
  }, [mode]);

  // Display error from callback redirect
  useEffect(() => {
    if (errorParam) {
      const decoded = decodeURIComponent(errorParam);
      setMessage(language === 'es' ? `❌ Error de autenticación: ${decoded}` : `❌ Authentication error: ${decoded}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [errorParam]);

  const t = {
    tagline: language === 'es' ? 'Nunca Entrenes Solo' : 'Never Train Alone',
    welcomeBack: language === 'es' ? '¡Bienvenido de nuevo!' : 'Welcome back!',
    joinCommunity: language === 'es' ? 'Únete a la comunidad' : 'Join the community',
    name: language === 'es' ? 'Nombre' : 'Name',
    namePlaceholder: language === 'es' ? 'Tu nombre' : 'Your name',
    birthDate: language === 'es' ? 'Fecha de Nacimiento' : 'Date of Birth',
    mustBe18:
      language === 'es' ? '❌ Debes tener 18 años o más para usar Tribe' : '❌ You must be 18 or older to use Tribe',
    enterBirthDate:
      language === 'es' ? '❌ Por favor ingresa tu fecha de nacimiento' : '❌ Please enter your date of birth',
    mustBe18Note: language === 'es' ? 'Debes tener 18 años o más' : 'You must be 18 or older',
    tosLabel: language === 'es' ? 'Acepto los' : 'I accept the',
    termsOfService: language === 'es' ? 'Términos de Servicio' : 'Terms of Service',
    andThe: language === 'es' ? 'y la' : 'and the',
    privacyPolicy: language === 'es' ? 'Política de Privacidad' : 'Privacy Policy',
    mustAcceptTos:
      language === 'es' ? '❌ Debes aceptar los Términos de Servicio' : '❌ You must accept the Terms of Service',
    email: language === 'es' ? 'Correo Electrónico' : 'Email',
    password: language === 'es' ? 'Contraseña' : 'Password',
    signIn: language === 'es' ? 'Iniciar Sesión' : 'Sign In',
    signUp: language === 'es' ? 'Registrarse' : 'Sign Up',
    loading: language === 'es' ? 'Cargando...' : 'Loading...',
    noAccount: language === 'es' ? '¿No tienes cuenta? Regístrate' : "Don't have an account? Sign up",
    hasAccount: language === 'es' ? '¿Ya tienes cuenta? Inicia sesión' : 'Already have an account? Sign in',
    forgotPassword: language === 'es' ? '¿Olvidaste tu contraseña?' : 'Forgot password?',
    resetEmailSent:
      language === 'es'
        ? '✅ Te enviamos un enlace para restablecer tu contraseña'
        : '✅ Password reset link sent to your email',
    enterEmailFirst:
      language === 'es' ? '❌ Ingresa tu correo electrónico primero' : '❌ Please enter your email first',
    backHome: language === 'es' ? '← Volver al inicio' : '← Back to home',
    verifyEmail:
      language === 'es'
        ? '⚠️ Por favor verifica tu correo antes de iniciar sesión.'
        : '⚠️ Please verify your email before logging in. Check your inbox.',
    checkEmail:
      language === 'es'
        ? '✅ ¡Revisa tu correo para verificar tu cuenta!'
        : '✅ Check your email to verify your account!',
    invalidEmail: language === 'es' ? '❌ Por favor ingresa un correo válido' : '❌ Please enter a valid email address',
    resetPassword: language === 'es' ? 'Restablecer Contraseña' : 'Reset Password',
    newPassword: language === 'es' ? 'Nueva Contraseña' : 'New Password',
    confirmPassword: language === 'es' ? 'Confirmar Contraseña' : 'Confirm Password',
    passwordsNoMatch: language === 'es' ? '❌ Las contraseñas no coinciden' : '❌ Passwords do not match',
    passwordUpdated:
      language === 'es' ? '✅ ¡Contraseña actualizada exitosamente!' : '✅ Password updated successfully!',
    updatePassword: language === 'es' ? 'Actualizar Contraseña' : 'Update Password',
    continueWithApple: language === 'es' ? 'Continuar con Apple' : 'Continue with Apple',
    or: language === 'es' ? 'o' : 'or',
    appleSignInError: language === 'es' ? '❌ Error al iniciar sesión con Apple' : '❌ Failed to sign in with Apple',
    continueWithGoogle: language === 'es' ? 'Continuar con Google' : 'Continue with Google',
    googleSignInError: language === 'es' ? '❌ Error al iniciar sesión con Google' : '❌ Failed to sign in with Google',
  };

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setMessage('');

    try {
      if (Capacitor.isNativePlatform()) {
        // Native: use Google Auth plugin to get ID token, then sign in via Supabase
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
          const returnTo = searchParams.get('returnTo');
          window.location.href = isNewUser ? '/profile/edit' : returnTo ? decodeURIComponent(returnTo) : '/';
        }
      } else {
        // Web: redirect-based OAuth flow (works in real browsers)
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/auth/callback?returnTo=${searchParams.get('returnTo') || ''}`,
          },
        });
        if (error) throw error;
      }
    } catch (err) {
      // User cancelled — silently return
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
      if (Capacitor.isNativePlatform()) {
        // Native: use Apple Sign In plugin, then sign in via Supabase
        const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
        const result = await SignInWithApple.authorize({
          clientId: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID || '',
          redirectURI: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`,
          scopes: 'email name',
        });

        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: result.response.identityToken,
        });
        if (error) throw error;

        if (data.user) {
          // Apple only provides the name on first sign-in
          const fullName = result.response.givenName
            ? `${result.response.givenName} ${result.response.familyName || ''}`.trim()
            : undefined;
          const { isNewUser } = await upsertUserProfile(data.user, fullName);
          const returnTo = searchParams.get('returnTo');
          window.location.href = isNewUser ? '/profile/edit' : returnTo ? decodeURIComponent(returnTo) : '/';
        }
      } else {
        // Web: redirect-based OAuth flow (works in real browsers)
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'apple',
          options: {
            redirectTo: `${window.location.origin}/auth/callback?returnTo=${searchParams.get('returnTo') || ''}`,
          },
        });
        if (error) throw error;
      }
    } catch (err) {
      // User cancelled — silently return
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

  function calculateAge(birthDate: string): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (!data.user?.email_confirmed_at) {
          setMessage(t.verifyEmail);
          await supabase.auth.signOut();
          return;
        }

        // Use hard redirect for Safari compatibility
        const returnTo = searchParams.get('returnTo');
        window.location.href = returnTo ? decodeURIComponent(returnTo) : '/';
      } else {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          setMessage(t.invalidEmail);
          return;
        }

        // Check ToS acceptance
        if (!acceptedTos) {
          setMessage(t.mustAcceptTos);
          return;
        }

        // Check age
        if (!birthDate) {
          setMessage(t.enterBirthDate);
          return;
        }

        const age = calculateAge(birthDate);
        if (age < 18) {
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
      setMessage('❌ ' + getErrorMessage(error, 'email_auth', language));
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
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (error: unknown) {
      logError(error, { action: 'handleResetPassword' });
      setMessage('❌ ' + getErrorMessage(error, 'reset_password', language));
    } finally {
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-tribe-green border-t-transparent rounded-full animate-spin" />
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
            <p className="text-tribe-green font-semibold text-lg mb-2">{t.tagline}</p>
            <p className="text-stone-600 dark:text-gray-300">
              {isResetPassword ? t.resetPassword : isLogin ? t.welcomeBack : t.joinCommunity}
            </p>
          </div>

          {!isResetPassword && (
            <>
              <button
                onClick={handleAppleSignIn}
                disabled={appleLoading || googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 py-3 bg-black text-white font-semibold rounded-lg hover:bg-gray-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 17 20" fill="currentColor">
                  <path d="M13.545 10.239c-.022-2.234 1.823-3.306 1.906-3.358-.037-.054-1.494-1.31-1.494-1.31-.997-1.27-2.551-1.443-3.104-1.463-.059-.006-.117-.009-.175-.009-1.17 0-2.285.694-2.882.694-.628 0-1.594-.676-2.619-.658C3.767 4.16 2.485 4.905 1.77 6.104.303 8.544 1.398 12.134 2.807 14.11c.685.966 1.502 2.05 2.576 2.012 1.033-.041 1.423-.669 2.672-.669 1.217 0 1.577.669 2.654.648 1.112-.019 1.812-.984 2.489-1.955.551-.789.952-1.604 1.163-2.052-.025-.011-2.818-1.082-2.816-4.29v-.565zM11.028 2.869C11.612 2.163 12.008 1.19 11.898.2c-.836.034-1.85.558-2.45 1.262-.538.624-.959 1.62-.839 2.576.933.073 1.884-.474 2.419-1.169z" />
                </svg>
                {appleLoading ? t.loading : t.continueWithApple}
              </button>

              <button
                onClick={handleGoogleSignIn}
                disabled={googleLoading || appleLoading || loading}
                className="w-full flex items-center justify-center gap-3 py-3 bg-white dark:bg-gray-100 text-stone-700 font-semibold rounded-lg border border-stone-300 hover:bg-stone-50 dark:hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed mt-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {googleLoading ? t.loading : t.continueWithGoogle}
              </button>

              <div className="flex items-center gap-4 my-2">
                <div className="flex-1 h-px bg-stone-300 dark:bg-gray-500"></div>
                <span className="text-sm text-stone-500 dark:text-gray-400">{t.or}</span>
                <div className="flex-1 h-px bg-stone-300 dark:bg-gray-500"></div>
              </div>
            </>
          )}

          {isResetPassword ? (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">
                  {t.newPassword}
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  enterKeyHint="next"
                  className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg focus:ring-2 focus:ring-tribe-green focus:border-transparent bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">
                  {t.confirmPassword}
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t.loading : t.updatePassword}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">{t.name}</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t.namePlaceholder}
                      required
                      autoComplete="name"
                      enterKeyHint="next"
                      className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg focus:ring-2 focus:ring-tribe-green focus:border-transparent bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">
                      {t.birthDate}
                    </label>
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      required
                      max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                      className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg focus:ring-2 focus:ring-tribe-green focus:border-transparent bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
                    />
                    <p className="text-xs text-stone-500 dark:text-gray-400 mt-1">{t.mustBe18Note}</p>

                    {/* Terms of Service Checkbox */}
                    <div className="flex items-start gap-2 mt-4">
                      <input
                        type="checkbox"
                        id="tos"
                        checked={acceptedTos}
                        onChange={(e) => setAcceptedTos(e.target.checked)}
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
                <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">{t.email}</label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  enterKeyHint="next"
                  className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg focus:ring-2 focus:ring-tribe-green focus:border-transparent bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">{t.password}</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  enterKeyHint={isLogin ? 'go' : 'next'}
                  className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg focus:ring-2 focus:ring-tribe-green focus:border-transparent bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
                />
                {!isLogin && password && (
                  <div className="mt-2">
                    <div className="w-full h-1.5 bg-stone-200 dark:bg-[#52575D] rounded-full overflow-hidden">
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
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="mt-2 text-sm text-tribe-green hover:underline disabled:opacity-50"
                  >
                    {t.forgotPassword}
                  </button>
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

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t.loading : isLogin ? t.signIn : t.signUp}
              </button>
            </form>
          )}

          {!isResetPassword && (
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setMessage('');
                }}
                className="text-sm text-tribe-green hover:underline"
              >
                {isLogin ? t.noAccount : t.hasAccount}
              </button>
            </div>
          )}

          <div className="mt-4 text-center">
            <Link href="/" className="text-sm text-stone-600 dark:text-gray-400 hover:text-tribe-green transition">
              {t.backHome}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
