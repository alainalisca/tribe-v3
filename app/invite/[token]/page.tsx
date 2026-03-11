/** Page: /invite/[token] — Accept a session invitation via shared link */
'use client';
import { logError } from '@/lib/logger';
import { formatTime12Hour } from '@/lib/utils';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { showSuccess, showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { fetchInviteWithSession, fetchUsersByIds, insertParticipant, updateSession } from '@/lib/dal';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, MapPin, Users, Clock } from 'lucide-react';
import Link from 'next/link';
import type { Database } from '@/lib/database.types';

type SessionRow = Database['public']['Tables']['sessions']['Row'];

interface InviterInfo {
  name: string | null;
  avatar_url: string | null;
}

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const supabase = createClient();
  const { language, t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [isGuest, setIsGuest] = useState(true);
  const [joining, setJoining] = useState(false);

  const [guestData, setGuestData] = useState({
    name: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    loadInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [token]);

  async function loadInvite() {
    try {
      // Check if user is logged in
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setIsGuest(false);
      }

      // Load invite token
      const inviteResult = await fetchInviteWithSession(supabase, token);
      if (!inviteResult.success) throw new Error(inviteResult.error);

      const inviteData = inviteResult.data as { expires_at: string; session: SessionRow; created_by: string };

      // Check if token expired
      if (new Date(inviteData.expires_at) < new Date()) {
        showError(t('inviteExpired'));
        return;
      }

      setSession(inviteData.session);

      // Load inviter info
      const usersResult = await fetchUsersByIds(supabase, [inviteData.created_by]);
      if (usersResult.success && usersResult.data && usersResult.data.length > 0) {
        setInviter({ name: usersResult.data[0].name, avatar_url: usersResult.data[0].avatar_url });
      }
    } catch (error) {
      logError(error, { action: 'loadInvite' });
      showError(t('invalidInvite'));
    } finally {
      setLoading(false);
    }
  }

  async function handleGuestJoin() {
    if (!guestData.name || !guestData.phone) {
      showError(t('fillNameAndPhone'));
      return;
    }
    if (!session) return;

    try {
      setJoining(true);

      // Check if session is full
      if ((session.current_participants ?? 0) >= session.max_participants) {
        showError(t('sessionFullMsg'));
        return;
      }

      // Add guest to participants
      const result = await insertParticipant(supabase, {
        session_id: session.id,
        user_id: null,
        is_guest: true,
        guest_name: guestData.name,
        guest_phone: guestData.phone,
        guest_email: guestData.email || null,
        status: 'confirmed',
      });

      if (!result.success) throw new Error(result.error);

      // Update participant count
      await updateSession(supabase, session.id, {
        current_participants: (session.current_participants ?? 0) + 1,
      });

      showSuccess(t('confirmedSeeYou'));

      // Show success message with session details
      setTimeout(() => {
        router.push('/');
      }, 3000);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'accept_invite', language));
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <p className="text-theme-primary">{t('loading')}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-theme-primary mb-2">{t('inviteNotFound')}</h1>
          <Link href="/" className="text-tribe-green hover:underline">
            {t('goHome')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-20 safe-area-top">
      <div className="bg-tribe-green p-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('youreInvited')}</h1>
        {inviter && (
          <p className="text-slate-800">
            {t('by')} {inviter.name}
          </p>
        )}
      </div>

      <div className="max-w-md mx-auto p-4">
        {/* Session Details */}
        <Card className="dark:bg-[#6B7178] mb-4">
          <CardContent className="p-4">
            <h2 className="text-xl font-bold text-theme-primary mb-3">{session.sport}</h2>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-stone-600 dark:text-gray-300">
                <Calendar className="w-4 h-4" />
                <span>
                  {new Date(session.date + 'T00:00:00').toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}
                </span>
              </div>
              <div className="flex items-center gap-2 text-stone-600 dark:text-gray-300">
                <Clock className="w-4 h-4" />
                <span>
                  {formatTime12Hour(session.start_time)} • {session.duration} {t('min')}
                </span>
              </div>
              <div className="flex items-center gap-2 text-stone-600 dark:text-gray-300">
                <MapPin className="w-4 h-4" />
                <span>{session.location}</span>
              </div>
              <div className="flex items-center gap-2 text-stone-600 dark:text-gray-300">
                <Users className="w-4 h-4" />
                <span>
                  {session.current_participants}/{session.max_participants} {t('confirmed')}
                </span>
              </div>
            </div>

            {session.description && (
              <p className="text-sm text-stone-600 dark:text-gray-300 mt-3 pt-3 border-t border-stone-200 dark:border-[#52575D]">
                {session.description}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Join Form */}
        {isGuest ? (
          <Card className="dark:bg-[#6B7178]">
            <CardContent className="p-4">
              <h3 className="text-lg font-bold text-theme-primary mb-3">{t('confirmYourSpot')}</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-1">{t('fullName')}</label>
                  <input
                    type="text"
                    value={guestData.name}
                    onChange={(e) => setGuestData({ ...guestData, name: e.target.value })}
                    placeholder={language === 'es' ? 'Juan Pérez' : 'John Smith'}
                    className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-1">{t('phone')}</label>
                  <input
                    type="tel"
                    value={guestData.phone}
                    onChange={(e) => setGuestData({ ...guestData, phone: e.target.value })}
                    placeholder="+57 300 123 4567"
                    className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-1">{t('emailOptional')}</label>
                  <input
                    type="email"
                    value={guestData.email}
                    onChange={(e) => setGuestData({ ...guestData, email: e.target.value })}
                    placeholder="email@example.com"
                    className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary"
                  />
                </div>

                <Button onClick={handleGuestJoin} disabled={joining} className="w-full font-bold">
                  {joining ? t('confirming') : t('confirmAttendance')}
                </Button>

                <p className="text-xs text-center text-stone-500 dark:text-gray-400 mt-3">
                  {t('infoSharedWithOrganizer')}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="dark:bg-[#6B7178]">
            <CardContent className="p-4 text-center">
              <p className="text-theme-primary mb-4">{t('haveAccountJoinFromApp')}</p>
              <Link
                href={`/session/${session.id}`}
                className="inline-block px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
              >
                {t('viewSession')}
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
