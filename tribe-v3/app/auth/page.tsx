'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function AuthPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    dateOfBirth: '',
  });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  });

  function calculateAge(dob: string): number {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  function eighteenYearsAgo(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 18);
    return date.toISOString().split('T')[0];
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        
        // Age verification
        const age = calculateAge(formData.dateOfBirth);
        if (age < 18) {
          alert('You must be 18 or older to use Tribe');
          setLoading(false);
          return;
        }
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });

        if (signUpError) throw signUpError;

        if (authData.user) {
          const { data: existingProfile } = await supabase
            .from('users')
            .select('id')
            .eq('id', authData.user.id)
            .single();

          if (!existingProfile) {
            const { error: profileError } = await supabase
              .from('users')
              .insert({
                id: authData.user.id,
                email: formData.email,
                name: formData.name,
              });

            if (profileError) throw profileError;
          } else {
            const { error: updateError } = await supabase
              .from('users')
              .update({ name: formData.name })
              .eq('id', authData.user.id);

            if (updateError) throw updateError;
          }
        }

        alert('Account created! Please log in.');
        setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });

        if (error) throw error;

        router.push('/');
        router.refresh();
      }
    } catch (error: any) {
      alert(error.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-[#6B7178] rounded-2xl p-8 shadow-xl border border-stone-200 dark:border-[#52575D]">
          <div className="mb-6">
            <Link href="/">
              <button className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded-lg transition mb-4">
                <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
              </button>
            </Link>
            <h1 className="text-3xl font-bold text-stone-900 dark:text-white">
              Tribe<span className="text-tribe-green">.</span>
            </h1>
            <p className="text-stone-600 dark:text-gray-300 mt-2">
              {mode === 'login' ? 'Welcome back!' : 'Create your account'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-gray-200 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-50 dark:bg-[#52575D] border border-stone-300 dark:border-[#404549] rounded-lg text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-tribe-green"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-gray-200 mb-2">
                Email
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 bg-stone-50 dark:bg-[#52575D] border border-stone-300 dark:border-[#404549] rounded-lg text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-tribe-green"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-gray-200 mb-2">
                Password
              </label>
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 bg-stone-50 dark:bg-[#52575D] border border-stone-300 dark:border-[#404549] rounded-lg text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-tribe-green"
                placeholder="••••••••"
              />
            </div>

            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-gray-200 mb-2">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    required
                    max={eighteenYearsAgo()}
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="w-full px-4 py-3 bg-stone-50 dark:bg-[#52575D] border border-stone-300 dark:border-[#404549] rounded-lg text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-tribe-green"
                  />
                  <p className="text-xs text-gray-500 mt-1">You must be 18 or older</p>
                </div>

                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    required
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 accent-tribe-green"
                  />
                  <span className="text-sm text-stone-700 dark:text-gray-300">
                    I accept the{' '}
                    <a
                      href="/legal/terms"
                      target="_blank"
                      className="text-tribe-green underline hover:text-tribe-green/80"
                    >
                      Terms of Service
                    </a>
                    {' 'and{' '}
                    <a
                      href="/legal/privacy"
                      target="_blank"
                      className="text-tribe-green underline hover:text-tribe-green/80"
                    >
                      Privacy Policy
                    </a>
                  </span>
                </label>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-tribe-green text-slate-900 rounded-lg font-semibold hover:bg-[#b0d853] transition disabled:opacity-50"
            >
              {loading ? 'Loading...' : mode === 'login' ? 'Log In' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-6 text-center">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-stone-700 dark:text-gray-200 mb-2">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    required
                    max={eighteenYearsAgo()}
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="w-full px-4 py-3 bg-stone-50 dark:bg-[#52575D] border border-stone-300 dark:border-[#404549] rounded-lg text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-tribe-green"
                  />
                  <p className="text-xs text-gray-500 mt-1">You must be 18 or older</p>
                </div>

                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    required
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 accent-tribe-green"
                  />
                  <span className="text-sm text-stone-700 dark:text-gray-300">
                    I accept the{' '}
                    <a
                      href="/legal/terms"
                      target="_blank"
                      className="text-tribe-green underline hover:text-tribe-green/80"
                    >
                      Terms of Service
                    </a>
                    {' 'and{' '}
                    <a
                      href="/legal/privacy"
                      target="_blank"
                      className="text-tribe-green underline hover:text-tribe-green/80"
                    >
                      Privacy Policy
                    </a>
                  </span>
                </label>
              </>
            )}

            <button
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-tribe-green hover:underline text-sm"
            >
              {mode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Log in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
