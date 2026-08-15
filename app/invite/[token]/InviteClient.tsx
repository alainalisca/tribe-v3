/**
 * InviteClient — the interactive half of /invite/[token].
 *
 * Everything Gate 1 depends on lives here: the mount-time getUser() (browser
 * cookies), the signed-out dual affordance (sign-in + guest form) vs the
 * signed-in Accept button, the guest form state, and both join handlers —
 * join_session_as_guest and joinSession must run on the BROWSER client so the
 * RPCs see the user's own JWT. The server half (page.tsx) exists for
 * generateMetadata and passes the validated invite down as initialInvite, so
 * this component normally does not refetch (same motivation as /s/[id]: kill
 * the wasted round-trip and the loading flash). If the server fetch failed
 * (transient), initialInvite is null and the client falls back to its own
 * fetch — the pre-split behavior.
 */
'use client';
import { logError } from '@/lib/logger';
import { formatTime12Hour } from '@/lib/utils';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { formatSessionLocation } from '@/lib/sessionLocation';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { fetchUsersByIds } from '@/lib/dal';
import { joinSession } from '@/lib/sessions';
import { getJoinErrorMessages } from '@/hooks/sessionActionTypes';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, MapPin, Users, Clock } from 'lucide-react';
import Link from 'next/link';
import type { ValidateInviteTokenSession } from '@/lib/database.types';

interface InviterInfo {
  name: string | null;
  avatar_url: string | null;
}

/**
 * Serializable invite payload the server page passes down. Mirrors the
 * validate_invite_token result (ValidateInviteTokenResult) plus the
 * display-only fields the server enriches: the session photo list and the
 * INVITER resolved from created_by (the HOST is session.creator_id — under D7
 * Option B they differ routinely).
 */
export interface InitialInvite {
  valid: boolean;
  reason?: 'not_found' | 'expired';
  session_id?: string;
  created_by?: string;
  expires_at?: string | null;
  session?: ValidateInviteTokenSession;
  photos?: string[] | null;
  inviter?: InviterInfo | null;
  host?: InviterInfo | null;
}

interface Props {
  token: string;
  initialInvite: InitialInvite | null;
}

export default function InviteClient({ token, initialInvite }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const { language, t } = useLanguage();
  const ti = useTranslations('invite');

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<ValidateInviteTokenSession | null>(null);
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [isGuest, setIsGuest] = useState(true);
  const [joining, setJoining] = useState(false);
  // T-INV1: registered-user acceptance needs the auth user's id/name, and the
  // expired state gets its own screen instead of falling through to "not found".
  const [authUser, setAuthUser] = useState<{ id: string; name: string } | null>(null);
  const [expired, setExpired] = useState(false);

  const [guestData, setGuestData] = useState({
    name: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    loadInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [token]);

  async function fetchInviter(createdBy: string | undefined) {
    if (!createdBy) return;
    const usersResult = await fetchUsersByIds(supabase, [createdBy]);
    if (usersResult.success && usersResult.data && usersResult.data.length > 0) {
      setInviter({ name: usersResult.data[0].name, avatar_url: usersResult.data[0].avatar_url });
    }
  }

  async function loadInvite() {
    // T-C1 Gate 1: login detection is isolated from token validation. getUser()
    // rejects on network failure, and sharing one try/catch painted a valid
    // invite as invalid. A failed check degrades to the logged-out branch,
    // which offers sign-in anyway.
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setIsGuest(false);
        setAuthUser({
          id: user.id,
          name: (user.user_metadata?.name as string | undefined) || user.email || 'Someone',
        });
      }
    } catch (error) {
      logError(error, { action: 'loadInvite.getUser' });
    }

    // Hydrated path: the server already ran validate_invite_token for
    // generateMetadata and handed us the result — no refetch. Invalid/expired
    // states render the same screens as before, just without a toast (nothing
    // threw; the state is known, not an error).
    if (initialInvite) {
      if (!initialInvite.valid && initialInvite.reason === 'expired') {
        setExpired(true);
      } else if (initialInvite.valid && initialInvite.session) {
        setSession(initialInvite.session);
        if (initialInvite.inviter) {
          setInviter(initialInvite.inviter);
        } else {
          // Server users read can fail independently of the token fetch.
          await fetchInviter(initialInvite.created_by).catch((error) =>
            logError(error, { action: 'loadInvite.fetchInviter' })
          );
        }
      }
      setLoading(false);
      return;
    }

    // Fallback path (server fetch failed): the pre-split client fetch.
    try {
      // RLS-H2: validate the token via the definer RPC (possessing the token IS
      // the authorization) instead of reading invite_tokens directly — Gate 3
      // makes the raw table unreadable. The RPC checks existence + expiry as owner.
      const { data: inviteRaw, error: inviteError } = await supabase.rpc('validate_invite_token', {
        p_token: token,
      });
      if (inviteError) throw new Error(inviteError.message);
      const inviteData = (typeof inviteRaw === 'string' ? JSON.parse(inviteRaw) : inviteRaw) as InitialInvite | null;

      // Expired token gets the dedicated screen (T-INV1), not the "not found" fallthrough.
      if (inviteData && !inviteData.valid && inviteData.reason === 'expired') {
        setExpired(true);
        return;
      }
      if (!inviteData?.valid || !inviteData.session) {
        throw new Error('invalid_invite');
      }

      setSession(inviteData.session);
      await fetchInviter(inviteData.created_by);
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

      // T-SEC1: add the guest via the SECURITY DEFINER guest RPC, not a direct
      // insert (Gate 3 removes the direct-insert RLS). The invite token is the
      // credential — the RPC validates it (exists, matches this session,
      // unexpired), derives status from join_policy, and enforces capacity
      // server-side. Running as owner, it also fixes the challenge_participants
      // recursion that 500s the current direct guest insert.
      const { data: guestResult, error: guestError } = await supabase.rpc('join_session_as_guest', {
        p_session_id: session.id,
        p_invite_token: token,
        p_guest_name: guestData.name,
        p_guest_phone: guestData.phone,
        p_guest_email: guestData.email || null,
      });
      if (guestError) throw new Error(guestError.message);
      const guestBody = typeof guestResult === 'string' ? JSON.parse(guestResult) : guestResult;
      if (!guestBody?.success) {
        showError(
          guestBody?.error === 'Session is full'
            ? t('sessionFullMsg')
            : getErrorMessage(guestBody?.error, 'accept_invite', language)
        );
        return;
      }

      // sessions.current_participants is recomputed inside the RPC.

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

  // T-INV1: registered-user acceptance. Reuses the standard joinSession
  // machinery (capacity, duplicates, paid status, host notification); the
  // token unlocks the invite_only gate.
  async function handleAcceptInvite() {
    if (!session || !authUser) return;
    setJoining(true);
    try {
      const result = await joinSession({
        supabase,
        sessionId: session.id,
        userId: authUser.id,
        userName: authUser.name,
        inviteToken: token,
      });

      if (!result.success) {
        if (result.error === 'invite_expired') setExpired(true);
        if (result.error === 'already_joined') {
          // "Already used" for a multi-use invite: you are already in.
          showInfo(getJoinErrorMessages(language)['already_joined']);
          router.push(`/session/${session.id}`);
          return;
        }
        const messages = getJoinErrorMessages(language);
        showError(messages[result.error ?? ''] || ti('acceptFailed'));
        return;
      }

      if (result.status === 'pending') {
        // Same pending copy as useSessionActions: paid (T-PAY1) → pay the
        // instructor directly; curated → host reviews the request.
        const paidRequest = !!session.is_paid && (session.price_cents ?? 0) > 0;
        showSuccess(paidRequest ? ti('requestSentPaid') : ti('requestSentCurated'));
      } else {
        showSuccess(t('confirmedSeeYou'));
      }
      router.push(`/session/${session.id}`);
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid flex items-center justify-center">
        <p className="text-theme-primary">{t('loading')}</p>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-theme-primary mb-2">{t('inviteExpired')}</h1>
          <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">{t('askHostForNewLink')}</p>
          <Link href="/" className="text-tribe-green hover:underline">
            {t('goHome')}
          </Link>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-theme-primary mb-2">{t('inviteNotFound')}</h1>
          <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">{t('askHostForNewLink')}</p>
          <Link href="/" className="text-tribe-green hover:underline">
            {t('goHome')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-20 safe-area-top">
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
        <Card className="dark:bg-tribe-card mb-4">
          <CardContent className="p-4">
            <h2 className="text-xl font-bold text-theme-primary mb-3">{session.sport}</h2>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-stone-600 dark:text-gray-300">
                <Calendar className="w-4 h-4" />
                <span>
                  {new Date(session.date + 'T00:00:00').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US')}
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
                <span>
                  {formatSessionLocation(
                    session.location,
                    session.location_lat ?? null,
                    session.location_lng ?? null,
                    language === 'es' ? 'es' : 'en'
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 text-stone-600 dark:text-gray-300">
                <Users className="w-4 h-4" />
                <span>
                  {session.current_participants}/{session.max_participants} {t('confirmed')}
                </span>
              </div>
            </div>

            {session.description && (
              <p className="text-sm text-stone-600 dark:text-gray-300 mt-3 pt-3 border-t border-stone-200 dark:border-tribe-mid">
                {session.description}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Join Form */}
        {isGuest ? (
          <>
            {/* T-C1 Gate 1: signed-out visitors get both doors. Sign-in is the
                primary action so account holders stop landing in unlinked guest
                rows; the guest form stays for people without an account. No
                account detection here: getUser() cannot tell "logged out" from
                "no account", and probing for one would be an enumeration oracle. */}
            <Card className="dark:bg-tribe-card mb-4">
              <CardContent className="p-4 text-center">
                <Button asChild className="w-full py-3 font-bold">
                  <Link href={`/auth?returnTo=${encodeURIComponent(`/invite/${token}`)}`}>{ti('signInToAccept')}</Link>
                </Button>
                <p className="text-xs text-stone-500 dark:text-gray-400 mt-2">{ti('signInToAcceptHint')}</p>
              </CardContent>
            </Card>

            <Card className="dark:bg-tribe-card">
              <CardContent className="p-4">
                <h3 className="text-lg font-bold text-theme-primary mb-1">{t('confirmYourSpot')}</h3>
                <p className="text-sm text-stone-600 dark:text-gray-300 mb-3">{ti('joinWithoutAccount')}</p>

                <div className="space-y-3">
                  <div>
                    <Label className="text-theme-primary mb-1">{t('fullName')}</Label>
                    <Input
                      type="text"
                      value={guestData.name}
                      onChange={(e) => setGuestData({ ...guestData, name: e.target.value })}
                      placeholder={language === 'es' ? 'Juan Pérez' : 'John Smith'}
                      className="h-auto py-3 dark:border-tribe-mid bg-white dark:bg-tribe-mid text-theme-primary"
                    />
                  </div>

                  <div>
                    <Label className="text-theme-primary mb-1">{t('phone')}</Label>
                    <Input
                      type="tel"
                      value={guestData.phone}
                      onChange={(e) => setGuestData({ ...guestData, phone: e.target.value })}
                      placeholder="+57 300 123 4567"
                      className="h-auto py-3 dark:border-tribe-mid bg-white dark:bg-tribe-mid text-theme-primary"
                    />
                  </div>

                  <div>
                    <Label className="text-theme-primary mb-1">{t('emailOptional')}</Label>
                    <Input
                      type="email"
                      value={guestData.email}
                      onChange={(e) => setGuestData({ ...guestData, email: e.target.value })}
                      placeholder="email@example.com"
                      className="h-auto py-3 dark:border-tribe-mid bg-white dark:bg-tribe-mid text-theme-primary"
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
          </>
        ) : (
          /* T-INV1: registered users accept here — the session page's
             invite-only lock never offers a join button. */
          <Card className="dark:bg-tribe-card">
            <CardContent className="p-4 text-center">
              <Button onClick={handleAcceptInvite} disabled={joining} className="w-full py-3 font-bold mb-3">
                {joining ? t('joining') : t('acceptInvitation')}
              </Button>
              <Link href={`/session/${session.id}`} className="text-sm text-tribe-green hover:underline">
                {t('viewSession')}
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
