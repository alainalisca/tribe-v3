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
import type { DalResult } from './types';

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

/** Hydrated row returned to the audit-viewer surface. */
export interface AuditLogRow {
  id: string;
  gym_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  /** Joined actor name + email — null when the user has been deleted (ON DELETE SET NULL). */
  actor: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
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

const MAX_AUDIT_PAGE_SIZE = 100;
const DEFAULT_AUDIT_PAGE_SIZE = 50;

export interface ListAuditOpts {
  /** Filter to a single action (e.g. 'client.purge'). Optional. */
  action?: string;
  /** Filter to a single target_type (e.g. 'client'). Optional. */
  targetType?: string;
  /**
   * Page size — defaults to DEFAULT_AUDIT_PAGE_SIZE, capped at
   * MAX_AUDIT_PAGE_SIZE. We cap because the viewer renders every row
   * client-side; no point in shipping 10k rows in one round trip when
   * the surface is "scan the last week of activity."
   */
  limit?: number;
  /** Inclusive lower bound on created_at (ISO timestamp). */
  fromIso?: string;
  /** Inclusive upper bound on created_at (ISO timestamp). */
  toIso?: string;
  /**
   * Filter to entries written by a single actor. Drives the
   * "Only mine" toggle on /os/audit so a coach can pull up
   * "what did I do?" without scanning everyone's activity.
   */
  actorUserId?: string;
}

/**
 * List audit entries for a gym, newest first.
 *
 * Uses the caller's regular Supabase client so RLS gates the read.
 * Migration 082's policy allows any coach in the gym to SELECT, so
 * the same call works for both owners and non-owner coaches — owner-
 * only is enforced at the route layer, not here.
 *
 * Returns hydrated rows with the actor's name + email joined in. When
 * a user has been deleted, `actor` is null (the FK is ON DELETE SET
 * NULL on actor_user_id specifically so the log survives user purges).
 */
export async function listAuditEntries(
  supabase: SupabaseClient,
  gymId: string,
  opts: ListAuditOpts = {}
): Promise<DalResult<AuditLogRow[]>> {
  try {
    const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? DEFAULT_AUDIT_PAGE_SIZE)), MAX_AUDIT_PAGE_SIZE);

    // PostgREST detects the FK from gym_audit_log.actor_user_id ->
    // users.id automatically since there's only one such relationship
    // on this table. No need to spell out the constraint name.
    let query = supabase
      .from('gym_audit_log')
      .select(
        `
          id, gym_id, action, target_type, target_id, payload, created_at,
          actor:users!actor_user_id(id, name, email)
        `
      )
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (opts.action) query = query.eq('action', opts.action);
    if (opts.targetType) query = query.eq('target_type', opts.targetType);
    if (opts.fromIso) query = query.gte('created_at', opts.fromIso);
    if (opts.toIso) query = query.lte('created_at', opts.toIso);
    if (opts.actorUserId) query = query.eq('actor_user_id', opts.actorUserId);

    const { data, error } = await query;
    if (error) {
      logError(error, { action: 'listAuditEntries', gymId });
      return { success: false, error: error.message };
    }

    const rows: AuditLogRow[] = (data ?? []).map((row) => {
      const actor = row.actor as unknown as { id: string; name: string | null; email: string | null } | null;
      return {
        id: row.id as string,
        gym_id: row.gym_id as string,
        action: row.action as string,
        target_type: row.target_type as string,
        target_id: (row.target_id as string | null) ?? null,
        payload: (row.payload as Record<string, unknown> | null) ?? null,
        created_at: row.created_at as string,
        actor: actor ? { id: actor.id, name: actor.name ?? null, email: actor.email ?? null } : null,
      };
    });

    return { success: true, data: rows };
  } catch (error) {
    logError(error, { action: 'listAuditEntries.exception', gymId });
    return { success: false, error: 'Failed to load audit log' };
  }
}

/**
 * Returns the most recent audit timestamp per actor in a gym, as a
 * Map<actor_user_id, ISO timestamp>. Powers the /os/coaches roster's
 * "Last action: 3 days ago" indicator so an owner can spot a
 * dormant coach at a glance.
 *
 * Implementation note: we fetch the last MAX_AUDIT_PAGE_SIZE entries
 * (newest first) and reduce in TS. That's not the same as a proper
 * SQL `select actor_user_id, max(created_at) group by actor_user_id`,
 * but for the typical multi-coach gym (3-10 coaches) the most-recent
 * 100 audit rows cover every active actor with massive headroom. A
 * coach who hasn't appeared in the last 100 entries is effectively
 * dormant for our purposes; we surface that as "Last action: > 1
 * week ago" on the consuming side.
 *
 * If the gym ever scales past where 100 rows is insufficient we'd
 * add a SQL view that does the real group-by — until then this is
 * O(100 rows + tiny TS reduce) and we save a migration.
 */
export async function fetchLastActionByActor(
  supabase: SupabaseClient,
  gymId: string
): Promise<DalResult<Map<string, string>>> {
  try {
    const { data, error } = await supabase
      .from('gym_audit_log')
      .select('actor_user_id, created_at')
      .eq('gym_id', gymId)
      // Exclude system-written rows — the watchdog's gym.alert_sent
      // entries have null actors but they'd still be the newest row
      // each time the watchdog fires. We want USER actions only.
      .neq('action', 'gym.alert_sent')
      .order('created_at', { ascending: false })
      .limit(MAX_AUDIT_PAGE_SIZE);
    if (error) {
      logError(error, { action: 'fetchLastActionByActor', gymId });
      return { success: false, error: error.message };
    }
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      const actor = row.actor_user_id as string | null;
      if (!actor) continue;
      // First occurrence wins because rows arrive newest-first.
      if (!map.has(actor)) map.set(actor, row.created_at as string);
    }
    return { success: true, data: map };
  } catch (error) {
    logError(error, { action: 'fetchLastActionByActor.exception', gymId });
    return { success: false, error: 'Failed to fetch last actions' };
  }
}

// ------------------------------------------------------------------
// CSV export
// ------------------------------------------------------------------

/** Hard cap on rows in a single audit export. */
const MAX_AUDIT_CSV_ROWS = 5000;

export interface GenerateAuditCsvOpts {
  action?: string;
  targetType?: string;
  /** ISO lower bound on created_at (inclusive). */
  fromIso?: string;
  /** ISO upper bound on created_at (inclusive). */
  toIso?: string;
  /** Filter to entries written by a single actor. */
  actorUserId?: string;
}

/**
 * Generate a CSV body for the gym's audit log. Columns:
 *   created_at | action | target_type | target_id |
 *   actor_name | actor_email | payload (JSON-stringified)
 *
 * Joins to users for actor display fields — same as listAuditEntries.
 * Rows where the actor was deleted (ON DELETE SET NULL fired)
 * render as empty actor_name / actor_email cells; we never invent
 * "Deleted user" text in the export because the file is a record
 * for auditors, not a UI.
 *
 * Caps at MAX_AUDIT_CSV_ROWS. Past that the file gets unwieldy for
 * Excel; if a gym genuinely needs more, the date-range filter is
 * the right escape hatch.
 */
export async function generateAuditLogCsv(
  supabase: SupabaseClient,
  gymId: string,
  opts: GenerateAuditCsvOpts = {}
): Promise<DalResult<string>> {
  try {
    let query = supabase
      .from('gym_audit_log')
      .select(
        `
          created_at, action, target_type, target_id, payload,
          actor:users!actor_user_id(name, email)
        `
      )
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(MAX_AUDIT_CSV_ROWS);

    if (opts.action) query = query.eq('action', opts.action);
    if (opts.targetType) query = query.eq('target_type', opts.targetType);
    if (opts.fromIso) query = query.gte('created_at', opts.fromIso);
    if (opts.toIso) query = query.lte('created_at', opts.toIso);
    if (opts.actorUserId) query = query.eq('actor_user_id', opts.actorUserId);

    const { data, error } = await query;
    if (error) {
      logError(error, { action: 'generateAuditLogCsv', gymId });
      return { success: false, error: error.message };
    }

    // Build the CSV body in-process. The rows-to-CSV helper lives in
    // lib/csv/serialize.ts but we don't import it here to keep the
    // DAL free of NextResponse / view-layer dependencies. We inline
    // the same escape rules.
    const headers = ['created_at', 'action', 'target_type', 'target_id', 'actor_name', 'actor_email', 'payload'];
    const escape = (val: string): string => (/["\,\n\r]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val);
    const rowToLine = (cells: string[]) => cells.map(escape).join(',');

    const lines: string[] = [rowToLine(headers)];
    for (const row of data ?? []) {
      const actor = row.actor as unknown as { name: string | null; email: string | null } | null;
      const payload = row.payload as Record<string, unknown> | null;
      lines.push(
        rowToLine([
          (row.created_at as string) ?? '',
          (row.action as string) ?? '',
          (row.target_type as string) ?? '',
          (row.target_id as string | null) ?? '',
          actor?.name ?? '',
          actor?.email ?? '',
          payload ? JSON.stringify(payload) : '',
        ])
      );
    }

    return { success: true, data: lines.join('\r\n') };
  } catch (error) {
    logError(error, { action: 'generateAuditLogCsv.exception', gymId });
    return { success: false, error: 'Failed to generate audit CSV' };
  }
}
