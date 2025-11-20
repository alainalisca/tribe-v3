'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Camera, Calendar, MapPin, Upload } from 'lucide-react';
import Link from 'next/link';

export default function MySessionsPage() {
  const [user, setUser] = useState<any>(null);
  const [sessionsNeedingPhotos, setSessionsNeedingPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

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
    await loadSessions(user.id);
  }

  async function loadSessions(userId: string) {
    try {
      // Get all past sessions user attended
      const { data: attendedSessions } = await supabase
        .from('session_attendance')
        .select(`
          session_id,
          sessions:session_id (
            id,
            sport,
            location,
            date,
            start_time
          )
        `)
        .eq('user_id', userId)
        .eq('attended', true);

      if (!attendedSessions) {
        setSessionsNeedingPhotos([]);
        return;
      }

      // Filter for sessions in the past
      const pastSessions = attendedSessions.filter(s => 
        s.sessions && new Date(s.sessions.date) < new Date()
      );

      // Check which ones don't have user photos yet
      const sessionsWithPhotoCount = await Promise.all(
        pastSessions.map(async (s) => {
          const { data: photoCount } = await supabase
            .from('session_recap_photos')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', s.session_id)
            .eq('user_id', userId);

          return {
            ...s.sessions,
            userPhotoCount: photoCount || 0
          };
        })
      );

      // Only show sessions where user hasn't uploaded any photos
      const needingPhotos = sessionsWithPhotoCount.filter(s => s.userPhotoCount === 0);
      setSessionsNeedingPhotos(needingPhotos);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
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
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">My Sessions</h1>
          <p className="text-sm text-stone-600 dark:text-gray-300 mt-1">
            Sessions where you can upload photos
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {sessionsNeedingPhotos.length === 0 ? (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-8 text-center">
            <Camera className="w-16 h-16 text-stone-300 dark:text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-2">
              All caught up! 🎉
            </h2>
            <p className="text-stone-600 dark:text-gray-300">
              You've shared photos for all your sessions, or there are no sessions to share.
            </p>
            <Link href="/">
              <button className="mt-6 px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition">
                Browse Sessions
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-tribe-green to-lime-400 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                📸 Share Your Memories
              </h2>
              <p className="text-slate-800">
                You have {sessionsNeedingPhotos.length} session{sessionsNeedingPhotos.length !== 1 ? 's' : ''} waiting for your photos!
              </p>
            </div>

            {sessionsNeedingPhotos.map((session) => (
              <Link key={session.id} href={`/session/${session.id}`}>
                <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg hover:shadow-xl transition cursor-pointer">
                  <div className="flex items-start justify-between mb-4">
                    <span className="px-4 py-2 bg-tribe-green text-slate-900 rounded-full text-sm font-bold">
                      {session.sport}
                    </span>
                    <div className="flex items-center gap-2 text-orange-500">
                      <Upload className="w-4 h-4" />
                      <span className="text-xs font-medium">Upload Photos</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center text-stone-900 dark:text-white">
                      <Calendar className="w-4 h-4 mr-2 text-stone-500" />
                      <span className="text-sm">
                        {new Date(session.date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        })} at {session.start_time}
                      </span>
                    </div>

                    <div className="flex items-center text-stone-900 dark:text-white">
                      <MapPin className="w-4 h-4 mr-2 text-stone-500" />
                      <span className="text-sm">{session.location}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-stone-200 dark:border-gray-600">
                    <p className="text-xs text-stone-600 dark:text-gray-400">
                      Tap to upload up to 3 photos from this session
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
