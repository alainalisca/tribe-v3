'use client';

import { logError } from '@/lib/logger';
import { useEffect, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { showSuccess, showError, showInfo } from '@/lib/toast';

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
        const { data: myLive } = await supabase
          .from('live_status')
          .select('expires_at')
          .eq('session_id', sessionId)
          .eq('user_id', user.id)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        if (myLive) {
          setIsLive(true);
          setLiveExpiresAt(new Date(myLive.expires_at));
        } else {
          setIsLive(false);
          setLiveExpiresAt(null);
        }
      }
      const { data: liveData } = await supabase
        .from('live_status')
        .select('user_id, started_at, user:users(name, avatar_url)')
        .eq('session_id', sessionId)
        .gt('expires_at', new Date().toISOString());
      if (liveData) {
        // REASON: Supabase joined query returns untyped nested objects
        setLiveUsers(
          liveData.map((row: any) => ({
            user_id: row.user_id,
            name: (row.user as any)?.name || 'Unknown',
            avatar_url: (row.user as any)?.avatar_url || null,
            started_at: row.started_at,
          }))
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
        await supabase
          .from('live_status')
          .update({ last_ping: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('session_id', sessionId);
      } catch {
        // Heartbeat ping is fire-and-forget; next interval will retry
      }
    }, 60000);
    return () => clearInterval(interval);
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
  }, [isLive, liveExpiresAt]);

  // Poll live users every 30s for today's sessions
  useEffect(() => {
    if (!sessionDate) return;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (sessionDate !== todayStr) return;
    const interval = setInterval(() => loadLiveStatus(), 30000);
    return () => clearInterval(interval);
  }, [sessionDate]);

  async function handleGoLive() {
    if (!user) return;
    setGoingLive(true);
    try {
      const { error } = await supabase.from('live_status').upsert(
        {
          user_id: user.id,
          session_id: sessionId,
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          last_ping: new Date().toISOString(),
        },
        { onConflict: 'user_id,session_id' }
      );
      if (error) throw error;
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
      await supabase.from('live_status').delete().eq('user_id', user.id).eq('session_id', sessionId);
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
      const { error } = await supabase
        .from('live_status')
        .update({
          expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          last_ping: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('session_id', sessionId);
      if (error) throw error;
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
