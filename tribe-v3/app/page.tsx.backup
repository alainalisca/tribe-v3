'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user]);

  async function checkUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
      } else {
        setUser(user);
      }
    } catch (err: any) {
      setError('Auth error: ' + err.message);
    }
  }

  async function loadSessions() {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'active')
        .gte('date', today)
        .order('date', { ascending: true });

      if (error) throw error;
      setSessions(data || []);
    } catch (err: any) {
      setError('Sessions error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <h1 className="text-2xl font-bold mb-4">Tribe</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {loading ? (
        <div>Loading sessions...</div>
      ) : (
        <div>
          <p className="mb-4">{sessions.length} sessions found</p>
          {sessions.map((session) => (
            <div key={session.id} className="bg-white p-4 rounded mb-2 border">
              <p className="font-bold">{session.sport}</p>
              <p className="text-sm">{session.location}</p>
              <p className="text-sm">{session.date}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
