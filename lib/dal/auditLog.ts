/**
 * lib/dal/auditLog.ts
 *
 * Append-only forensic logging for sensitive actions in a gym.
 *
 * The table itself (migration 082) is open for INSERT to any coach
 * in the gym, gated by `actor_user_id = auth.uid()`. That means we
 * can write entries through the caller's regular Supabase client —
 * no service-role required, RLS keeps everyone honest.
 *
 * Failures are logged but never thrown. The audit entry is a
 * side-effect of the underlying mutation; if it fails, the mutation
 * should still succeed. Worst case is a missing forensic row, which
 * is recoverable; throwing here would make every delete brittle.
 *
 * Usage pattern in mutation DAL functions:
 *
 *   const result = await supabase.from('clients').update(...);
 *   if (result.success) {
 *     await writeAuditEntry(supabase, {
 *       gymId, actorUserId, action: 'client.archive',
 *       targetType: 'client', targetId: clientId,
 *       payload: { name: row.name }
 *     });
 *   }
 *   return result;
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';

export interface AuditEntry {
  gymId: string;
  actorUserId: string;
  /** Canonical action name. Use dotted notation, e.g. 'client.archive'. */
  action: string;
  /** Loose category, e.g. 'client', 'attendance', 'team', 'gym'. */
  targetType: string;
  /** The thing acted on. Null for actions that don't have a single target. */
  targetId?: string | null;
  /** Free-form metadata. Goes into the payload jsonb column. */
  payload?: Record<string, unknown>;
}

/**
 * Append an audit entry. Never throws — failures are logged so the
 * caller's main mutation isn't affected by a logging hiccup.
 */
export async function writeAuditEntry(supabase: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await supabase.from('gym_audit_log').insert({
      gym_id: entry.gymId,
      actor_user_id: entry.actorUserId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId ?? null,
      payload: entry.payload ?? null,
    });
    if (error) {
      // Don't propagate — log and continue. A missing audit row is
      // recoverable; a thrown error from inside a delete handler
      // would make the whole mutation surface as failed.
      logError(error, {
        action: 'writeAuditEntry',
        auditAction: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
      });
    } else {
      log('debug', 'audit_entry_written', {
        action: 'writeAuditEntry',
        auditAction: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
      });
    }
  } catch (error) {
    logError(error, { action: 'writeAuditEntry.exception', auditAction: entry.action });
  }
}
