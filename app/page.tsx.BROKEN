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
      console.log('User check:', user); // DEBUG
      if (!user) {
        router.push('/auth');
      } else {
        setUser(user);
      }
    } catch (err: any) {
      console.error('Auth error:', err); // DEBUG
      setError('Auth error: ' + err.message);
    }
  }

  async function loadSessions() {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      console.log('Loading sessions for date >=', today); // DEBUG

      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('status', 'active')
        .gte('date', today)
        .order('date', { ascending: true });

      console.log('Sessions loaded:', data); // DEBUG
      console.log('Sessions error:', error); // DEBUG
      
      if (error) throw error;
      setSessions(data || []);
    } catch (err: any) {
      console.error('Sessions error:', err); // DEBUG
      setError('Sessions error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Add this to see what's happening
  useEffect(() => {
    console.log('Current state:', {
      user: !!user,
      loading,
      sessionsCount: sessions.length,
      error
    });
  }, [user, loading, sessions, error]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-900 text-lg">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <h1 className="text-2xl font-bold mb-4 text-gray-900">Tribe</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {loading ? (
        <div className="text-gray-900 text-lg">Loading sessions...</div>
      ) : (
        <div>
          <p className="mb-4 text-gray-900 text-lg font-semibold">
            {sessions.length} sessions found
          </p>
          
          {sessions.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-400 text-yellow-800 px-4 py-3 rounded">
              No active sessions found. Create one to get started!
            </div>
          ) : (
            sessions.map((session) => (
              <div 
                key={session.id} 
                className="bg-white p-4 rounded mb-2 border border-gray-200 shadow-sm"
                onClick={() => router.push(`/session/${session.id}`)}
              >
                <p className="font-bold text-gray-900 text-lg">{session.sport || 'Unknown Sport'}</p>
                <p className="text-sm text-gray-700 mt-1">{session.location || 'No location'}</p>
                <p className="text-sm text-gray-600 mt-1">{session.date || 'No date'}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Status: {session.status} | ID: {session.id?.substring(0, 8)}
                </p>
              </div>
            ))
          )}
        </div>
      )}
      
      {/* Debug panel - remove after fixing */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded text-xs">
        <p className="font-bold text-blue-900">Debug Info:</p>
        <p className="text-blue-800">User: {user?.email || 'none'}</p>
        <p className="text-blue-800">Loading: {loading ? 'yes' : 'no'}</p>
        <p className="text-blue-800">Sessions: {sessions.length}</p>
        <p className="text-blue-800">Error: {error || 'none'}</p>
      </div>
    </div>
  );
}
