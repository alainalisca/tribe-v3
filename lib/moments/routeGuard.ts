import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { isMomentsEnabled } from '@/lib/features/moments';
import { canGrantPhotographer, canUploadToSession, loadUploadContext, type UploadContext } from './permissions';

/**
 * T-MOM1: the gate every Moments manager route opens with.
 *   flag off            404 (the feature does not exist)
 *   not a UUID          404
 *   signed out          401
 *   no such session     404
 *   not host, admin or photographer   403
 * On success: the user, a service-role client (writes go through it after
 * this check), and the permission context.
 */
export const PRIVATE = { 'Cache-Control': 'private, no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GuardOk = { ok: true; user: User; service: SupabaseClient; ctx: UploadContext };
export type GuardFail = { ok: false; res: NextResponse };

export const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: PRIVATE });

export async function signedInUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function guardMomentsManager(sessionId: string): Promise<GuardOk | GuardFail> {
  if (!isMomentsEnabled()) return { ok: false, res: fail(404, 'not_found') };
  if (!UUID.test(sessionId)) return { ok: false, res: fail(404, 'not_found') };
  const user = await signedInUser();
  if (!user) return { ok: false, res: fail(401, 'unauthorized') };
  const service = getServiceRoleClient();
  const ctx = await loadUploadContext(service, sessionId, user.id);
  if (!ctx) return { ok: false, res: fail(404, 'not_found') };
  if (!canUploadToSession(ctx)) return { ok: false, res: fail(403, 'forbidden') };
  return { ok: true, user, service, ctx };
}

export type MeOk = { ok: true; user: User; service: SupabaseClient };

/**
 * T-MOM1 Part C: the gate for a person's own Momentos routes. Flag off 404,
 * a media id that is not a UUID 404, signed out 401. What they may touch is
 * then decided by their own tag (lib/moments/myActions.ts).
 */
export async function guardMe(mediaId?: string): Promise<MeOk | GuardFail> {
  if (!isMomentsEnabled()) return { ok: false, res: fail(404, 'not_found') };
  if (mediaId !== undefined && !UUID.test(mediaId)) return { ok: false, res: fail(404, 'not_found') };
  const user = await signedInUser();
  if (!user) return { ok: false, res: fail(401, 'unauthorized') };
  return { ok: true, user, service: getServiceRoleClient() };
}

/**
 * T-MOM1 Part C: the gate for "Fotógrafo de esta sesión". Like the manager
 * gate, but only the host or an admin passes: a photographer never names
 * another.
 */
export async function guardPhotographerGranter(sessionId: string): Promise<GuardOk | GuardFail> {
  if (!isMomentsEnabled()) return { ok: false, res: fail(404, 'not_found') };
  if (!UUID.test(sessionId)) return { ok: false, res: fail(404, 'not_found') };
  const user = await signedInUser();
  if (!user) return { ok: false, res: fail(401, 'unauthorized') };
  const service = getServiceRoleClient();
  const ctx = await loadUploadContext(service, sessionId, user.id);
  if (!ctx) return { ok: false, res: fail(404, 'not_found') };
  if (!canGrantPhotographer(ctx)) return { ok: false, res: fail(403, 'forbidden') };
  return { ok: true, user, service, ctx };
}
