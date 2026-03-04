'use client';

import { logError } from '@/lib/logger';
import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import {
  upsertLiveStatus,
  deleteLiveStatus,
  fetchMyLiveExpiry,
  fetchLiveUsersWithDetails,
  pingLiveStatus,
  renewLiveStatus,
} from '@/lib/dal';

interface LiveUser {
  user_id: string;
  name: string;
  avatar_url: string | null;
  started_at: string;
}

interface UseLiveStatusParams {
  supabase: SupabaseClient;
  sessionId: string;
  sessionDate: string | null;
  user: { id: string } | null;
  language: 'en' | 'es';
}

export function useLiveStatus({ supabase, sessionId, sessionDate, user, language }: UseLiveStatusParams) {
  const [isLive, setIsLive] = useState(false);
  const [liveExpiresAt, setLiveExpiresAt] = useState<Date | null>(null);
  const [liveCountdown, setLiveCountdown] = useState('');
  const [liveUsers, setLiveUsers] = useState<LiveUser[]>([]);
  const [goingLive, setGoingLive] = useState(false);

  async function loadLiveStatus() {
    try {
      if (user) {
        const expiryResult = await fetchMyLiveExpiry(supabase, sessionId, user.id);
        if (expiryResult.success && expiryResult.data) {
          setIsLive(true);
          setLiveExpiresAt(new Date(expiryResult.data));
        } else {
          setIsLive(false);
          setLiveExpiresAt(null);
        }
      }
      const liveResult = await fetchLiveUsersWithDetails(supabase, sessionId);
      if (liveResult.success && liveResult.data) {
        setLiveUsers(
          (liveResult.data as Array<{ user_id: string; started_at: string; user: unknown }>).map((row) => {
            const rawUser = row.user;
            const userObj = (Array.isArray(rawUser) ? rawUser[0] : rawUser) as {
              name: string;
              avatar_url: string | null;
            } | null;
            return {
              user_id: row.user_id,
              name: userObj?.name || 'Unknown',
              avatar_url: userObj?.avatar_url || null,
              started_at: row.started_at,
            };
          })
        );
      }
    } catch (error) {
      logError(error, { action: 'loadLiveStatus', sessionId });
    }
  }

  // Ping last_ping every 60s while live
  useEffect(() => {
    if (!isLive || !user) return;
    const interval = setInterval(async () => {
      try {
        await pingLiveStatus(supabase, user.id, sessionId);
      } catch {
        // Heartbeat ping is fire-and-forget; next interval will retry
      }
    }, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: deps tracked via isLive and user
  }, [isLive, user]);

  // Countdown timer every 1s while live
  useEffect(() => {
    if (!isLive || !liveExpiresAt) return;
    const interval = setInterval(() => {
      const remaining = liveExpiresAt.getTime() - Date.now();
      if (remaining <= 0) {
        setIsLive(false);
        setLiveExpiresAt(null);
        setLiveCountdown('');
        loadLiveStatus();
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setLiveCountdown(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional countdown expiry effect
  }, [isLive, liveExpiresAt]);

  // Poll live users every 30s for today's sessions
  useEffect(() => {
    if (!sessionDate) return;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (sessionDate !== todayStr) return;
    const interval = setInterval(() => loadLiveStatus(), 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: polls on sessionDate change
  }, [sessionDate]);

  async function handleGoLive() {
    if (!user) return;
    setGoingLive(true);
    try {
      const result = await upsertLiveStatus(supabase, {
        user_id: user.id,
        session_id: sessionId,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        last_ping: new Date().toISOString(),
      });
      if (!result.success) throw new Error(result.error);
      setIsLive(true);
      setLiveExpiresAt(new Date(Date.now() + 15 * 60 * 1000));
      showSuccess(language === 'es' ? '¡Estás en vivo!' : "You're live!");
      await loadLiveStatus();
    } catch {
      showError(language === 'es' ? 'Error al iniciar live' : 'Failed to go live');
    } finally {
      setGoingLive(false);
    }
  }

  async function handleEndLive() {
    if (!user) return;
    try {
      const result = await deleteLiveStatus(supabase, user.id, sessionId);
      if (!result.success) throw new Error(result.error);
      setIsLive(false);
      setLiveExpiresAt(null);
      setLiveCountdown('');
      showInfo(language === 'es' ? 'Live terminado' : 'Live ended');
      await loadLiveStatus();
    } catch {
      showError(language === 'es' ? 'Error al terminar live' : 'Failed to end live');
    }
  }

  async function handleRenewLive() {
    if (!user) return;
    try {
      const result = await renewLiveStatus(supabase, user.id, sessionId, {
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        last_ping: new Date().toISOString(),
      });
      if (!result.success) throw new Error(result.error);
      setLiveExpiresAt(new Date(Date.now() + 15 * 60 * 1000));
      showSuccess(language === 'es' ? '¡Live renovado 15 min!' : 'Live renewed 15 min!');
    } catch {
      showError(language === 'es' ? 'Error al renovar' : 'Failed to renew');
    }
  }

  return {
    isLive,
    liveCountdown,
    liveUsers,
    goingLive,
    loadLiveStatus,
    handleGoLive,
    handleEndLive,
    handleRenewLive,
  };
}
