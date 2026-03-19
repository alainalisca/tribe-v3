/** Hook: useLiveStatus — loads and tracks live training statuses for sessions */
'use client';

import { useState, useCallback } from 'react';
import { fetchLiveUsersWithDetails } from '@/lib/dal';
import { logError } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LiveUserWithDetails } from '@/lib/dal';

export function useLiveStatus(supabase: SupabaseClient) {
  const [liveStatusMap, setLiveStatusMap] = useState<
    Record<string, { count: number; users: Array<{ name: string; avatar_url: string | null }> }>
  >({});
  const [liveUserIdSet, setLiveUserIdSet] = useState<Set<string>>(new Set());

  const loadLiveStatuses = useCallback(
    async (sessionIds: string[]) => {
      if (sessionIds.length === 0) return;
      try {
        const CHUNK_SIZE = 5;
        const results: Array<{ sid: string; r: Awaited<ReturnType<typeof fetchLiveUsersWithDetails>> }> = [];
        for (let i = 0; i < sessionIds.length; i += CHUNK_SIZE) {
          const chunk = sessionIds.slice(i, i + CHUNK_SIZE);
          const chunkResults = await Promise.all(
            chunk.map((sid) => fetchLiveUsersWithDetails(supabase, sid).then((r) => ({ sid, r })))
          );
          results.push(...chunkResults);
        }
        const map: Record<string, { count: number; users: Array<{ name: string; avatar_url: string | null }> }> = {};
        const userIds = new Set<string>();
        for (const { sid, r } of results) {
          if (!r.success || !r.data || r.data.length === 0) continue;
          for (const row of r.data as LiveUserWithDetails[]) {
            userIds.add(row.user_id);
            if (!map[sid]) map[sid] = { count: 0, users: [] };
            map[sid].count++;
            map[sid].users.push({ name: row.user?.name || 'Unknown', avatar_url: row.user?.avatar_url || null });
          }
        }
        setLiveStatusMap(map);
        setLiveUserIdSet(userIds);
      } catch (error) {
        logError(error, { action: 'loadLiveStatuses' });
      }
    },
    [supabase]
  );

  return { liveStatusMap, liveUserIdSet, loadLiveStatuses };
}
