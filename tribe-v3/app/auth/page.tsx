'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  const supabase = createClient();

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
          setMessage('⚠️ Please verify your email before logging in. Check your inbox.');
          await supabase.auth.signOut();
          return;
        }

        router.push('/');
      } else {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          setMessage('❌ Please enter a valid email address');
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) throw error;

        if (data.user) {
          await supabase.from('users').insert({
            id: data.user.id,
            email: data.user.email,
            name,
          });

          setMessage('✅ Check your email to verify your account!');
          setEmail('');
          setPassword('');
          setName('');
        }
      }
    } catch (error: any) {
      setMessage('❌ ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-[#6B7178] rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-stone-900 dark:text-white mb-2">
              Tribe<span className="text-tribe-green">.</span>
            </h1>
            <p className="text-stone-600 dark:text-gray-300">
              {isLogin ? 'Welcome back!' : 'Join the community'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-stone-300 dark:border-gray-600 bg-white dark:bg-[#52575D] text-stone-900 dark:text-white focus:ring-2 focus:ring-tribe-green focus:border-transparent"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-stone-300 dark:border-gray-600 bg-white dark:bg-[#52575D] text-stone-900 dark:text-white focus:ring-2 focus:ring-tribe-green focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-lg border border-stone-300 dark:border-gray-600 bg-white dark:bg-[#52575D] text-stone-900 dark:text-white focus:ring-2 focus:ring-tribe-green focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {message && (
              <div className={`p-3 rounded-lg text-sm ${
                message.includes('✅') 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : (isLogin ? 'Sign In' : 'Sign Up')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setMessage('');
              }}
              className="text-sm text-stone-600 dark:text-gray-300 hover:text-tribe-green transition"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>

          {isLogin && (
            <div className="mt-4 text-center">
              <Link 
                href="/auth/reset-password"
                className="text-sm text-stone-600 dark:text-gray-300 hover:text-tribe-green transition"
              >
                Forgot password?
              </Link>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-stone-600 dark:text-gray-300 hover:text-tribe-green transition">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
