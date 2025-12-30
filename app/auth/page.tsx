'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import LanguageToggle from '@/components/LanguageToggle';

export default function AuthPage() {
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode');
  const [isLogin, setIsLogin] = useState(true);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [acceptedTos, setAcceptedTos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();

  useEffect(() => {
    if (mode === 'reset-password') {
      setIsResetPassword(true);
    }
  }, [mode]);

  const t = {
    tagline: language === 'es' ? 'Nunca Entrenes Solo' : 'Never Train Alone',
    welcomeBack: language === 'es' ? '¡Bienvenido de nuevo!' : 'Welcome back!',
    joinCommunity: language === 'es' ? 'Únete a la comunidad' : 'Join the community',
    name: language === 'es' ? 'Nombre' : 'Name',
    namePlaceholder: language === 'es' ? 'Tu nombre' : 'Your name',
    birthDate: language === 'es' ? 'Fecha de Nacimiento' : 'Date of Birth',
    mustBe18: language === 'es' ? '❌ Debes tener 18 años o más para usar Tribe' : '❌ You must be 18 or older to use Tribe',
    enterBirthDate: language === 'es' ? '❌ Por favor ingresa tu fecha de nacimiento' : '❌ Please enter your date of birth',
    mustBe18Note: language === 'es' ? 'Debes tener 18 años o más' : 'You must be 18 or older',
    tosLabel: language === 'es' ? 'Acepto los' : 'I accept the',
    termsOfService: language === 'es' ? 'Términos de Servicio' : 'Terms of Service',
    andThe: language === 'es' ? 'y la' : 'and the',
    privacyPolicy: language === 'es' ? 'Política de Privacidad' : 'Privacy Policy',
    mustAcceptTos: language === 'es' ? '❌ Debes aceptar los Términos de Servicio' : '❌ You must accept the Terms of Service',
    email: language === 'es' ? 'Correo Electrónico' : 'Email',
    password: language === 'es' ? 'Contraseña' : 'Password',
    signIn: language === 'es' ? 'Iniciar Sesión' : 'Sign In',
    signUp: language === 'es' ? 'Registrarse' : 'Sign Up',
    loading: language === 'es' ? 'Cargando...' : 'Loading...',
    noAccount: language === 'es' ? '¿No tienes cuenta? Regístrate' : "Don't have an account? Sign up",
    hasAccount: language === 'es' ? '¿Ya tienes cuenta? Inicia sesión' : 'Already have an account? Sign in',
    forgotPassword: language === 'es' ? '¿Olvidaste tu contraseña?' : 'Forgot password?',
    resetEmailSent: language === 'es' ? '✅ Te enviamos un enlace para restablecer tu contraseña' : '✅ Password reset link sent to your email',
    enterEmailFirst: language === 'es' ? '❌ Ingresa tu correo electrónico primero' : '❌ Please enter your email first',
    backHome: language === 'es' ? '← Volver al inicio' : '← Back to home',
    verifyEmail: language === 'es' ? '⚠️ Por favor verifica tu correo antes de iniciar sesión.' : '⚠️ Please verify your email before logging in. Check your inbox.',
    checkEmail: language === 'es' ? '✅ ¡Revisa tu correo para verificar tu cuenta!' : '✅ Check your email to verify your account!',
    invalidEmail: language === 'es' ? '❌ Por favor ingresa un correo válido' : '❌ Please enter a valid email address',
    resetPassword: language === 'es' ? 'Restablecer Contraseña' : 'Reset Password',
    newPassword: language === 'es' ? 'Nueva Contraseña' : 'New Password',
    confirmPassword: language === 'es' ? 'Confirmar Contraseña' : 'Confirm Password',
    passwordsNoMatch: language === 'es' ? '❌ Las contraseñas no coinciden' : '❌ Passwords do not match',
    passwordUpdated: language === 'es' ? '✅ ¡Contraseña actualizada exitosamente!' : '✅ Password updated successfully!',
    updatePassword: language === 'es' ? 'Actualizar Contraseña' : 'Update Password',
  };

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
        window.location.href = '/';
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
          body: JSON.stringify({ email, password, name, birthDate, acceptedTos }),
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);

        setMessage(t.checkEmail);
        setEmail('');
        setPassword('');
        setName('');
        setBirthDate('');
      }
    } catch (error: any) {
      setMessage('❌ ' + error.message);
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
    } catch (error: any) {
      setMessage('❌ ' + error.message);
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
    } catch (error: any) {
      setMessage('❌ ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-[#6B7178] rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-stone-900 dark:text-white mb-2">
              Tribe<span className="text-tribe-green">.</span>
            </h1>
            <p className="text-tribe-green font-semibold text-lg mb-2">{t.tagline}</p>
            <p className="text-stone-600 dark:text-gray-300">
              {isResetPassword ? t.resetPassword : (isLogin ? t.welcomeBack : t.joinCommunity)}
            </p>
          </div>

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
                  className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg focus:ring-2 focus:ring-tribe-green focus:border-transparent bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
                />
              </div>

              {message && (
                <div className={`p-3 rounded-lg text-sm ${
                  message.includes('✅')
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                }`}>
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
                  <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">
                    {t.name}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.namePlaceholder}
                    required
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
                    {t.tosLabel}{" "}
                    <Link href="/legal/terms" className="text-tribe-green hover:underline">{t.termsOfService}</Link>
                    {" "}{t.andThe}{" "}
                    <Link href="/legal/privacy" className="text-tribe-green hover:underline">{t.privacyPolicy}</Link>
                  </label>
                </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">
                {t.email}
              </label>
              <input
                type="email" placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg focus:ring-2 focus:ring-tribe-green focus:border-transparent bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">
                {t.password}
              </label>
              <input
                type="password" placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg focus:ring-2 focus:ring-tribe-green focus:border-transparent bg-white dark:bg-[#52575D] text-stone-900 dark:text-white"
              />
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
              <div className={`p-3 rounded-lg text-sm ${
                message.includes('✅') 
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300' 
                  : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
              }`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t.loading : (isLogin ? t.signIn : t.signUp)}
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
