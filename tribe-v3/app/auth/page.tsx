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
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
        });

        if (signUpError) throw signUpError;

        if (authData.user) {
          const { error: profileError } = await supabase
            .from('users')
            .insert({
              id: authData.user.id,
              email: formData.email,
              name: formData.name,
            });

          if (profileError) throw profileError;
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
    <div className="min-h-screen bg-tribe-darker flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-tribe-dark rounded-2xl p-8 shadow-xl">
          <div className="mb-6">
            <Link href="/">
              <button className="p-2 hover:bg-slate-700 rounded-lg transition mb-4">
                <ArrowLeft className="w-6 h-6 text-white" />
              </button>
            </Link>
            <h1 className="text-3xl font-bold text-white">
              Tribe<span className="text-tribe-green">.</span>
            </h1>
            <p className="text-gray-400 mt-2">
              {mode === 'login' ? 'Welcome back!' : 'Create your account'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-white font-medium mb-2">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-3 bg-tribe-darker border border-slate-600 rounded-lg text-white focus:outline-none focus:border-tribe-green"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label className="block text-white font-medium mb-2">Email</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full p-3 bg-tribe-darker border border-slate-600 rounded-lg text-white focus:outline-none focus:border-tribe-green"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label className="block text-white font-medium mb-2">Password</label>
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full p-3 bg-tribe-darker border border-slate-600 rounded-lg text-white focus:outline-none focus:border-tribe-green"
                placeholder="••••••••"
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-tribe-green hover:underline"
            >
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
