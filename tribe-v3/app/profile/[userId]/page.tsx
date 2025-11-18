'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, MapPin, Shield, Flag } from 'lucide-react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;
  const supabase = createClient();
  
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({
    sessionsCreated: 0,
    sessionsJoined: 0,
    totalSessions: 0,
    attendanceRate: 0,
    totalAttendance: 0,
  });
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadProfile();
    checkCurrentUser();
  }, [userId]);

  async function checkCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
    
    if (user) {
      const { data } = await supabase
        .from('blocked_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('blocked_user_id', userId)
        .single();
      
      setIsBlocked(!!data);
    }
  }

  async function loadProfile() {
    try {
      const { data: profileData } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      setProfile(profileData);

      const { count: created } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', userId)
        .eq('status', 'active');

      const { count: joined } = await supabase
        .from('session_participants')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Get attendance stats
      const { data: attendanceData } = await supabase
        .rpc('get_user_attendance_stats', { user_uuid: userId });

      const attendance = attendanceData?.[0] || { 
        total_sessions: 0, 
        attended_sessions: 0, 
        attendance_rate: 0 
      };

      setStats({
        sessionsCreated: created || 0,
        sessionsJoined: joined || 0,
        totalSessions: (created || 0) + (joined || 0),
        attendanceRate: Number(attendance.attendance_rate) || 0,
        totalAttendance: Number(attendance.total_sessions) || 0,
      });
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleBlock() {
    if (!currentUser) return;

    try {
      if (isBlocked) {
        await supabase
          .from('blocked_users')
          .delete()
          .eq('user_id', currentUser.id)
          .eq('blocked_user_id', userId);
        
        setIsBlocked(false);
        alert('✅ User unblocked');
      } else {
        if (!confirm(`Block ${profile.name}? You won't see their sessions or messages.`)) return;
        
        await supabase
          .from('blocked_users')
          .insert({
            user_id: currentUser.id,
            blocked_user_id: userId,
          });
        
        setIsBlocked(true);
        alert('✅ User blocked');
      }
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
    }
  }

  async function handleReport() {
    if (!reportReason.trim()) {
      alert('Please select a reason');
      return;
    }

    setSubmitting(true);
    try {
      await supabase
        .from('reported_users')
        .insert({
          reporter_id: currentUser.id,
          reported_user_id: userId,
          reason: reportReason,
          description: reportDescription,
        });

      alert('✅ Report submitted. Our team will review it.');
      setShowReportModal(false);
      setReportReason('');
      setReportDescription('');
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">Loading...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">User not found</p>
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  };

  const sports = profile?.sports || [];
  const isOwnProfile = currentUser?.id === userId;
  const hasLowAttendance = stats.totalAttendance >= 3 && stats.attendanceRate < 70;

  return (
    <div className="min-h-screen bg-theme-page pb-20">
      <div className="bg-theme-card p-4 border-b border-theme">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <button onClick={() => router.back()} className="p-2 hover:bg-stone-200 rounded-lg transition mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </button>
            <h1 className="text-xl font-bold text-theme-primary">{profile.name}'s Profile</h1>
          </div>
          
          {!isOwnProfile && currentUser && (
            <div className="flex gap-2">
              <button
                onClick={handleBlock}
                className={`p-2 rounded-lg transition ${
                  isBlocked 
                    ? 'bg-green-500 text-white hover:bg-green-600' 
                    : 'bg-red-500 text-white hover:bg-red-600'
                }`}
                title={isBlocked ? 'Unblock user' : 'Block user'}
              >
                <Shield className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowReportModal(true)}
                className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
                title="Report user"
              >
                <Flag className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="relative h-48 bg-gradient-to-br from-tribe-green to-lime-500">
          {profile?.banner_url && (
            <img 
              src={profile.banner_url} 
              alt="Banner" 
              className="w-full h-full object-cover"
            />
          )}
        </div>

        <div className="px-4 -mt-16 relative z-10">
          <div className="w-32 h-32 rounded-full border-4 border-white bg-tribe-green flex items-center justify-center overflow-hidden shadow-lg">
            {profile?.avatar_url ? (
              <img 
                src={profile.avatar_url} 
                alt={profile.name} 
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-5xl font-bold text-slate-900">
                {getInitials(profile?.name || 'User')}
              </span>
            )}
          </div>

          {isBlocked && (
            <div className="mt-4 bg-red-100 border border-red-300 rounded-lg p-3">
              <p className="text-sm text-red-700">
                🚫 You have blocked this user. Click the shield icon to unblock.
              </p>
            </div>
          )}

          {hasLowAttendance && !isOwnProfile && (
            <div className="mt-4 bg-orange-100 border border-orange-300 rounded-lg p-3">
              <p className="text-sm text-orange-700">
                ⚠️ Low attendance rate - This user has a {stats.attendanceRate.toFixed(0)}% show-up rate
              </p>
            </div>
          )}

          <div className="mt-4">
            <h2 className="text-2xl font-bold text-theme-primary">{profile?.name}</h2>
            <div className="flex items-center gap-3 mt-2">
              {profile?.username && (
                <span className="text-sm text-theme-secondary">@{profile.username}</span>
              )}
              {profile?.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-tribe-green" />
                  <span className="text-sm text-theme-secondary">{profile.location}</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mt-6">
            <div className="bg-white rounded-2xl p-3 text-center border border-stone-200">
              <p className="text-3xl font-bold text-theme-primary">{stats.sessionsCreated}</p>
              <p className="text-xs text-theme-secondary mt-1">Created</p>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center border border-stone-200">
              <p className="text-3xl font-bold text-theme-primary">{stats.sessionsJoined}</p>
              <p className="text-xs text-theme-secondary mt-1">Joined</p>
            </div>
            <div className="bg-white rounded-2xl p-3 text-center border border-stone-200">
              <p className="text-3xl font-bold text-theme-primary">{stats.totalSessions}</p>
              <p className="text-xs text-theme-secondary mt-1">Total</p>
            </div>
            <div className={`bg-white rounded-2xl p-3 text-center border ${
              hasLowAttendance ? 'border-orange-300 bg-orange-50' : 'border-stone-200'
            }`}>
              <p className={`text-3xl font-bold ${
                hasLowAttendance ? 'text-orange-600' : 'text-theme-primary'
              }`}>
                {stats.totalAttendance > 0 ? `${stats.attendanceRate.toFixed(0)}%` : 'N/A'}
              </p>
              <p className="text-xs text-theme-secondary mt-1">Attendance</p>
            </div>
          </div>

          {profile?.bio && (
            <div className="mt-6 bg-white rounded-2xl p-5 border border-stone-200">
              <p className="text-theme-primary whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {profile?.photos && profile.photos.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-theme-primary mb-3">Photos</h3>
              <div className="grid grid-cols-3 gap-2">
                {profile.photos.map((photo: string, index: number) => (
                  <div key={index} className="aspect-square rounded-lg overflow-hidden bg-stone-200">
                    <img 
                      src={photo} 
                      alt={`Photo ${index + 1}`} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {sports.length > 0 && (
            <div className="mt-6">
              <div className="flex flex-wrap gap-2">
                {sports.map((sport: string, index: number) => (
                  <span 
                    key={index}
                    className="px-5 py-2.5 bg-tribe-green text-slate-900 rounded-full text-sm font-medium"
                  >
                    {sport}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Report User</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Reason *</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="">Select a reason</option>
                  <option value="harassment">Harassment</option>
                  <option value="inappropriate">Inappropriate behavior</option>
                  <option value="spam">Spam</option>
                  <option value="fake">Fake account</option>
                  <option value="no-show">Repeated no-shows</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Additional details (optional)</label>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Provide more context..."
                  className="w-full p-2 border rounded-lg h-24 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowReportModal(false)}
                className="flex-1 px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={handleReport}
                disabled={submitting || !reportReason}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
