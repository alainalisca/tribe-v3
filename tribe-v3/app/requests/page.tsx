'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Check, X, User } from 'lucide-react';
import Link from 'next/link';

export default function RequestsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
      return;
    }
    setUser(user);
      setRequests(prev => prev.filter(r => r.id !== requestId));
    
  }

  async function loadRequests(userId: string) {
    try {
      // Get all sessions created by this user
      const { data: mySessions } = await supabase
        .from('sessions')
        .select('id, sport, date, start_time, location')
        .eq('creator_id', userId);

      if (!mySessions || mySessions.length === 0) {
        setLoading(false);
        return;
      }

      const sessionIds = mySessions.map(s => s.id);
      console.log('My sessions:', mySessions);
      console.log('Session IDs:', sessionIds);

      // Get all pending requests for these sessions
      // Test simple query first
      const { data: testData, error: testError } = await supabase
        .from('session_participants')
        .select('*');

      console.log('Test query - data:', testData);
      console.log('Test query - error:', testError);

      if (testError) {
        console.error('Table query failed:', testError);
        setLoading(false);
        return;
      }

      const { data: pendingRequests, error: reqError } = await supabase
        .from('session_participants')
        .select('*');

      console.log('Pending requests:', pendingRequests);
      console.log('Request error:', reqError);

      // Filter for only this user's sessions
      const filteredRequests = pendingRequests?.filter(req => 
        sessionIds.includes(req.session_id)
      );
      console.log('Filtered requests (only yours):', filteredRequests);

      // Combine session info with requests
      console.log('Pending requests:', pendingRequests);
      const requestsWithSessions = filteredRequests?.map(req => ({
        ...req,
        session: mySessions.find(s => s.id === req.session_id)
      })) || [];

      setRequests(requestsWithSessions);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(requestId: string) {
    try {
      const { error } = await supabase
        .from('session_participants')
        .update({ status: 'confirmed' })
        .eq('id', requestId);

      if (error) throw error;

      alert('Request accepted!');
      setRequests(prev => prev.filter(r => r.id !== requestId));
      
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  async function handleDecline(requestId: string, sessionId: string) {
    try {
      // Delete the request
      const { error: deleteError } = await supabase
        .from('session_participants')
        .delete()
        .eq('id', requestId);

      if (deleteError) throw deleteError;

      // Decrease participant count
      const request = requests.find(r => r.id === requestId);
      if (request) {
        const { error: updateError } = await supabase
          .from('sessions')
          .update({ 
            current_participants: request.session.current_participants - 1 
          })
          .eq('id', sessionId);

        if (updateError) throw updateError;
      }

      alert('Request declined');
      setRequests(prev => prev.filter(r => r.id !== requestId));
      
    } catch (error: any) {
      alert('Error: ' + error.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <p className="text-stone-900 dark:text-white">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-20">
      <div className="bg-stone-200 dark:bg-[#272D34] p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/">
            <button className="p-2 hover:bg-stone-300 dark:hover:bg-[#52575D] rounded-lg transition">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">
            Join Requests
          </h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {requests.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-stone-600 dark:text-gray-400">No pending requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div 
                key={request.id}
                className="bg-white dark:bg-[#6B7178] rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-stone-900 dark:text-white">
                      {request.session.sport} - {request.session.location}
                    </h3>
                    <p className="text-sm text-stone-600 dark:text-gray-400">
                      {new Date(request.session.date).toLocaleDateString()} at {request.session.start_time}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-4 p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg">
                  {request.users?.avatar_url ? (
                    <img 
                      src={request.users.avatar_url} 
                      alt={request.users.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-stone-300 dark:bg-[#404549] rounded-full flex items-center justify-center">
                      <User className="w-6 h-6 text-stone-600 dark:text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-stone-900 dark:text-white">
                      {request.users?.name}
                    </p>
                    {request.users?.sports && request.users.sports.length > 0 && (
                      <p className="text-sm text-stone-600 dark:text-gray-400">
                        {request.users.sports.map((s: any) => s.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <Link href={`/profile/${request.user_id}`}>
                    <button className="text-xs text-tribe-green hover:underline">
                      View Profile
                    </button>
                  </Link>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(request.id)}
                    className="flex-1 py-2 bg-tribe-green text-slate-900 font-semibold rounded-lg hover:bg-lime-500 transition flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Accept
                  </button>
                  <button
                    onClick={() => handleDecline(request.id, request.session_id)}
                    className="flex-1 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
