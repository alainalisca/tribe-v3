/**
 * lib/dal/adminSessionDelete.ts
 *
 * Admin hard-delete of a session. SERVER ONLY: call it with the service-role
 * client handed out by requireApiAdmin(), never with a browser client.
 *
 * Three rules shape this function, and each one exists because the obvious
 * version is wrong:
 *
 * 1. A SESSION WITH PAYMENT RECORDS IS NEVER DELETED. `payments` lives in
 *    production with no migration file in this repo, so its ON DELETE rule is
 *    unknown from here. If it is CASCADE, a delete would erase financial
 *    history; if it is RESTRICT, the delete would fail anyway. Either way the
 *    right tool for a paid session is cancelSession(), which refunds. So this
 *    checks first and refuses, and a failed check also refuses (fail closed).
 *
 * 2. A REPEATING SERIES IS DELETED WHOLE OR NOT AT ALL. The recurring-sessions
 *    cron recreates any missing child date inside its lookahead window
 *    (childSessionExists -> createChildSession). Deleting one occurrence would
 *    look like it worked and come back on the next cron run. So any session
 *    that is a series parent, or a child of one, resolves to the whole series:
 *    the parent plus every child. The caller must say `scope: 'series'` to
 *    confirm it knows that, so a stale UI cannot delete a series by accident.
 *
 * 3. THE DELETE IS ONE STATEMENT. `DELETE ... WHERE id IN (...)` is atomic in
 *    Postgres, cascades included (participants, comments, waitlist, reviews,
 *    stories and the rest are ON DELETE CASCADE in the migrations). If a
 *    production-only foreign key refuses (SQLSTATE 23503), nothing is deleted
 *    and the caller gets `linked_records` instead of a half-removed series.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';

export type AdminSessionDeleteError =
  | 'session_not_found'
  | 'series_requires_scope'
  | 'has_payments'
  | 'linked_records'
  | 'check_failed'
  | 'delete_failed';

export interface AdminSessionDeleteOptions {
  /** Required when the session belongs to a repeating series. */
  scope?: 'single' | 'series';
  /** Admin performing the delete, for the log line. */
  actorUserId?: string;
}

export interface AdminSessionDeleteResult {
  deletedIds: string[];
  wasSeries: boolean;
}

/** Result whose error is always one of the codes above. */
export type AdminSessionDeleteOutcome =
  | { success: true; data: AdminSessionDeleteResult }
  | { success: false; error: AdminSessionDeleteError };

export async function adminDeleteSession(
  service: SupabaseClient,
  sessionId: string,
  opts: AdminSessionDeleteOptions = {}
): Promise<AdminSessionDeleteOutcome> {
  try {
    // 1. The target itself.
    const { data: target, error: targetErr } = await service
      .from('sessions')
      .select('id, is_recurring, recurring_parent_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (targetErr) {
      logError(targetErr, { action: 'adminDeleteSession.target', sessionId });
      return { success: false, error: 'check_failed' };
    }
    if (!target) return { success: false, error: 'session_not_found' };

    // 2. Resolve the series. Root is the parent if this is a child, else itself.
    const rootId: string = target.recurring_parent_id ?? target.id;
    const { data: children, error: childErr } = await service
      .from('sessions')
      .select('id')
      .eq('recurring_parent_id', rootId);
    if (childErr) {
      logError(childErr, { action: 'adminDeleteSession.children', sessionId, rootId });
      return { success: false, error: 'check_failed' };
    }
    const childIds = (children ?? []).map((c: { id: string }) => c.id);
    const isSeries = target.recurring_parent_id !== null || target.is_recurring === true || childIds.length > 0;

    if (isSeries && opts.scope !== 'series') {
      return { success: false, error: 'series_requires_scope' };
    }

    const ids = Array.from(new Set([rootId, ...childIds]));

    // 3. Payments, across every session about to go. Fail closed on error.
    const { count: paymentCount, error: payErr } = await service
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .in('session_id', ids);
    if (payErr) {
      logError(payErr, { action: 'adminDeleteSession.payments', sessionId, ids });
      return { success: false, error: 'check_failed' };
    }
    if ((paymentCount ?? 0) > 0) return { success: false, error: 'has_payments' };

    // 4. One statement. Cascades run inside it; a refusing FK rolls it all back.
    const { data: deleted, error: delErr } = await service.from('sessions').delete().in('id', ids).select('id');
    if (delErr) {
      logError(delErr, { action: 'adminDeleteSession.delete', sessionId, ids, code: delErr.code });
      return { success: false, error: delErr.code === '23503' ? 'linked_records' : 'delete_failed' };
    }

    const deletedIds = (deleted ?? []).map((d: { id: string }) => d.id);
    if (deletedIds.length === 0) {
      // Gone between the check and the delete: report it as not found rather
      // than claiming a delete that did not happen.
      return { success: false, error: 'session_not_found' };
    }

    log('info', 'admin deleted session', {
      action: 'adminDeleteSession',
      actorUserId: opts.actorUserId,
      sessionId,
      deletedIds,
      wasSeries: isSeries,
    });
    return { success: true, data: { deletedIds, wasSeries: isSeries } };
  } catch (error) {
    logError(error, { action: 'adminDeleteSession', sessionId });
    return { success: false, error: 'delete_failed' };
  }
}
