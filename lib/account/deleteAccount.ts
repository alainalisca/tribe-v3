import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

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
 *                 refuses the login delete; the gym is transferred first)
 *   list_files    account_deletion_files (migration 228): their uploads
 *   delete_files  removed through the Storage API, then listed again: any file
 *                 still there is a failure, never a silent leftover
 *   scrub_data    account_scrub (228), one transaction: the profile cleared,
 *                 private data and their posts deleted, the future cancelled,
 *                 the past kept under "Usuario eliminado"
 *   delete_login  auth.admin.deleteUser; already gone counts as done
 *
 * Files go before the data: the listing finds Moments through session_media
 * rows, which the scrub deletes.
 */
export const DELETION_STEPS = ['check', 'list_files', 'delete_files', 'scrub_data', 'delete_login'] as const;
export type DeletionStep = (typeof DELETION_STEPS)[number];

export type DeletionResult = { ok: true; filesDeleted: number } | { ok: false; step: DeletionStep; error: string };

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

  const { error: loginErr } = await service.auth.admin.deleteUser(userId);
  if (loginErr && !isUserNotFound(loginErr)) return fail('delete_login', loginErr.message);

  return { ok: true, filesDeleted: listed.files.length };
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
