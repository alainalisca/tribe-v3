import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bogotaToday } from '@/lib/time/bogotaDate';
import {
  NO_CANCEL_PUSHES,
  sendSessionCancelledPush,
  type CancelPushSummary,
  type CancelledSession,
} from '@/lib/notify/sessionCancelledPush';

/**
 * T-DEL1: the one way an account is deleted. The in-app route
 * (/api/account/delete) and the admin route (/api/admin/users/[id]/delete)
 * both call this with the service-role client, so a person deleted by an admin
 * loses exactly what a person who deletes themselves loses.
 *
 * Steps, in order. Each checks its error and the first failure stops the run,
 * naming its step. Every step is safe to run again, so a run that stopped
 * partway is finished by running it again:
 *   check         the users row exists and owns no gym (gyms.owner_user_id
 *                 refuses the login delete; the gym is transferred first),
 *                 and the confirmed athletes of their upcoming active sessions
 *                 are noted, because after the scrub nothing says which
 *                 sessions it cancelled
 *   list_files    account_deletion_files (migration 228): their uploads
 *   delete_files  removed through the Storage API, then listed again: any file
 *                 still there is a failure, never a silent leftover
 *   scrub_data    account_scrub (228), one transaction: the profile cleared,
 *                 private data and their posts deleted, the future cancelled,
 *                 the past kept under "Usuario eliminado"
 *   notify        each noted session the scrub cancelled (active before, now
 *                 cancelled) gets the cancel push its host would have sent
 *                 (lib/notify/sessionCancelledPush). A rerun notes nothing,
 *                 since those sessions are no longer active, so nobody is told
 *                 twice. One recipient's push failing is counted, not a stop:
 *                 the cancel itself has already happened
 *   delete_login  auth.admin.deleteUser; already gone counts as done
 *
 * Files go before the data: the listing finds Moments through session_media
 * rows, which the scrub deletes.
 *
 * ACCOUNTS ARE DELETED ONLY HERE (the app's Settings or the admin page), never
 * from the Supabase Auth dashboard. Since migration 228 the profile no longer
 * cascades from the login: deleting a user in the dashboard removes the login
 * and leaves the profile, their files and their personal data behind, with
 * nothing to show it happened. To finish one deleted that way, run the admin
 * delete on the profile: every step is safe to repeat.
 */
export const DELETION_STEPS = ['check', 'list_files', 'delete_files', 'scrub_data', 'notify', 'delete_login'] as const;
export type DeletionStep = (typeof DELETION_STEPS)[number];

export type DeletionResult =
  | { ok: true; filesDeleted: number; notified: CancelPushSummary }
  | { ok: false; step: DeletionStep; error: string };

type StoredFile = { bucket: string; path: string };

/** Storage removes at most this many paths per call. */
const REMOVE_BATCH = 100;

export async function deleteAccount(service: SupabaseClient, userId: string): Promise<DeletionResult> {
  const fail = (step: DeletionStep, error: string): DeletionResult => ({ ok: false, step, error });

  const { data: user, error: userErr } = await service.from('users').select('id').eq('id', userId).maybeSingle();
  if (userErr) return fail('check', userErr.message);
  if (!user) return fail('check', 'user_not_found');
  const { data: gyms, error: gymErr } = await service.from('gyms').select('id').eq('owner_user_id', userId).limit(1);
  if (gymErr) return fail('check', gymErr.message);
  if (gyms && gyms.length > 0) return fail('check', 'owns_gym');
  const upcoming = await upcomingAthletes(service, userId);
  if ('error' in upcoming) return fail('check', upcoming.error);

  const listed = await listFiles(service, userId);
  if ('error' in listed) return fail('list_files', listed.error);

  for (const [bucket, paths] of byBucket(listed.files)) {
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const { error } = await service.storage.from(bucket).remove(paths.slice(i, i + REMOVE_BATCH));
      if (error) return fail('delete_files', `${bucket}: ${error.message}`);
    }
  }
  const left = await listFiles(service, userId);
  if ('error' in left) return fail('delete_files', left.error);
  if (left.files.length > 0) {
    return fail('delete_files', `${left.files.length} file(s) still there after the delete`);
  }

  const { error: scrubErr } = await service.rpc('account_scrub', { p_user: userId });
  if (scrubErr) return fail('scrub_data', scrubErr.message);

  const notified = { ...NO_CANCEL_PUSHES };
  if (upcoming.sessions.length > 0) {
    const { data: now, error: nowErr } = await service
      .from('sessions')
      .select('id')
      .in(
        'id',
        upcoming.sessions.map((u) => u.session.id)
      )
      .eq('status', 'cancelled');
    if (nowErr) return fail('notify', nowErr.message);
    const cancelled = new Set(((now ?? []) as Array<{ id: string }>).map((r) => r.id));
    for (const { session, athletes } of upcoming.sessions) {
      if (!cancelled.has(session.id)) continue;
      const sent = await sendSessionCancelledPush(service, session, athletes, 'account-deletion');
      for (const k of Object.keys(notified) as Array<keyof CancelPushSummary>) notified[k] += sent[k];
    }
  }

  const { error: loginErr } = await service.auth.admin.deleteUser(userId);
  if (loginErr && !isUserNotFound(loginErr)) return fail('delete_login', loginErr.message);

  return { ok: true, filesDeleted: listed.files.length, notified };
}

/**
 * Their sessions from today (Bogotá) on that are still active, the scrub's own
 * rule, each with the athletes confirmed in it: an account, not a door guest,
 * and not the host.
 */
async function upcomingAthletes(
  service: SupabaseClient,
  userId: string
): Promise<{ sessions: Array<{ session: CancelledSession; athletes: string[] }> } | { error: string }> {
  const { data: rows, error } = await service
    .from('sessions')
    .select('id, creator_id, title, sport, date, is_paid')
    .eq('creator_id', userId)
    .in('status', ['active', 'upcoming'])
    .gte('date', bogotaToday());
  if (error) return { error: error.message };
  const sessions = (rows ?? []) as CancelledSession[];
  if (sessions.length === 0) return { sessions: [] };
  const { data: spots, error: spotErr } = await service
    .from('session_participants')
    .select('session_id, user_id')
    .in(
      'session_id',
      sessions.map((s) => s.id)
    )
    .eq('status', 'confirmed');
  if (spotErr) return { error: spotErr.message };
  const bySession = new Map<string, Set<string>>();
  for (const r of (spots ?? []) as Array<{ session_id: string; user_id: string | null }>) {
    if (!r.user_id || r.user_id === userId) continue;
    bySession.set(r.session_id, (bySession.get(r.session_id) ?? new Set()).add(r.user_id));
  }
  return { sessions: sessions.map((session) => ({ session, athletes: [...(bySession.get(session.id) ?? [])] })) };
}

async function listFiles(
  service: SupabaseClient,
  userId: string
): Promise<{ files: StoredFile[] } | { error: string }> {
  const { data, error } = await service.rpc('account_deletion_files', { p_user: userId });
  if (error) return { error: error.message };
  return { files: (data ?? []) as StoredFile[] };
}

function byBucket(files: StoredFile[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of files) out.set(f.bucket, [...(out.get(f.bucket) ?? []), f.path]);
  return out;
}

/** A login that is already gone: a previous run got that far. */
function isUserNotFound(err: { status?: number; code?: string; message?: string }): boolean {
  return err.status === 404 || err.code === 'user_not_found' || /user not found/i.test(err.message ?? '');
}
