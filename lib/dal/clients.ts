/**
 * DAL: Tribe.OS instructor client roster + per-session attendance.
 *
 * Backed by migration 062. RLS scopes both tables to the authenticated
 * instructor — pass the user's session client (not the service-role
 * client) and the policies do the rest.
 *
 * Used by:
 *   - app/api/tribe-os/clients/* (Mission 3)
 *   - app/os/clients/* pages (Missions 4 + 5)
 *   - app/session/[id]/* attendance recording (Mission 6)
 *   - revenue dashboard aggregations (Week 3)
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { rowsToCsv } from '@/lib/csv/serialize';
import type { DalResult } from './types';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type Currency = 'USD' | 'COP';
export type PaymentMethod = 'cash' | 'transfer' | 'stripe' | 'other';

/**
 * Engagement state. Added by migration 072. Distinct from `archived`
 * (which is the soft-delete flag).
 *   active   — currently training
 *   inactive — stopped but kept on the roster for possible reactivation
 *   lead     — potential client who has not yet started
 *   lapsed   — stopped without explicit reactivation; the at-risk
 *              widget flags `active` clients whose last_seen_at is
 *              older than the threshold and `lapsed` is the manual
 *              override of that signal
 */
export type ClientStatus = 'active' | 'inactive' | 'lead' | 'lapsed';

/** Mirror of the clients table columns. */
export interface ClientRow {
  id: string;
  instructor_user_id: string;
  /**
   * Owning gym. Nullable during the Path B transition (migration 068):
   * existing rows are backfilled by migration 069; new rows created
   * via createClient with a gym context populate this; rows created
   * via the legacy code path leave it null and rely on the legacy
   * instructor_user_id RLS branch (migration 070).
   */
  gym_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  contact_info: Record<string, unknown> | null;
  notes: string | null;
  tags: string[];
  /** Engagement state. Added in migration 072. Defaults to 'active'. */
  status: ClientStatus;
  /** Free-form medical / injury / restriction notes. Added in 072. */
  health_notes: string | null;
  /**
   * Cached max(attended_at). Maintained by the sync_client_last_seen
   * trigger on client_attendance. NULL when the client has no
   * attended attendance rows yet. Added in migration 072.
   */
  last_seen_at: string | null;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  // ── Intelligence columns (migration 075) ────────────────────────
  /**
   * AI-computed churn probability (0.000–1.000). Updated by the
   * nightly batch and on demand via /api/tribe-os/ai/rescore-member.
   * NULL means the member has never been scored yet.
   */
  churn_risk_score: number | null;
  /** When churn_risk_score was last updated. NULL on never-scored rows. */
  churn_risk_updated_at: string | null;
  /**
   * Derived health label from churn_risk_score. Distinct from
   * `status` (which is the admin-controlled active/lead/lapsed/
   * inactive enum) — health_status is what the AI assigns, status
   * is what the gym owner sets manually.
   */
  health_status: 'HEALTHY' | 'WATCH' | 'AT_RISK';
  /** Cached attendance counters (updated by triggers / nightly batch). */
  total_sessions: number;
  sessions_last_30_days: number;
  current_streak_days: number;
  longest_streak_days: number;
}

/**
 * Tenant context — discriminated union the DAL accepts in place of a
 * bare instructorUserId. The gym branch is preferred; the legacy
 * branch stays for backward compat until the cleanup migration drops
 * the instructor_user_id RLS path.
 */
export type ClientTenantContext =
  | { gymId: string; instructorUserId: string }
  | { gymId: null; instructorUserId: string };

/** Mirror of the client_attendance table columns. */
export interface AttendanceRow {
  id: string;
  client_id: string;
  session_id: string;
  attended: boolean;
  paid: boolean;
  attended_at: string | null;
  amount_paid_cents: number | null;
  currency: Currency | null;
  payment_method: PaymentMethod | null;
  notes: string | null;
  /**
   * Refund fields (migration 083). All three are NULL when the row
   * has never been refunded; all three are non-null after a refund
   * is recorded. Migration 083's CHECK constraint enforces both
   * the all-or-nothing rule and the
   * `refunded_amount_cents <= amount_paid_cents` upper bound.
   */
  refunded_amount_cents: number | null;
  refunded_at: string | null;
  refund_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Aggregate stats joined onto a client row for list views. */
export interface ClientWithStats extends ClientRow {
  last_attendance_at: string | null;
  total_attended_count: number;
  total_paid_cents_usd: number;
  total_paid_cents_cop: number;
}

/** Aggregate-only summary for the client detail page. */
export interface ClientAttendanceSummary {
  total_attended_count: number;
  total_paid_cents_usd: number;
  total_paid_cents_cop: number;
  last_attendance_at: string | null;
}

/**
 * Attendance row joined with the session it references. Used by the
 * client detail page's history list. The session join is bounded to
 * the columns the UI needs.
 */
export interface AttendanceWithSession extends AttendanceRow {
  session: {
    id: string;
    title: string | null;
    sport: string;
    date: string;
    start_time: string | null;
  } | null;
}

/**
 * Attendance row joined with the client it references. Used by the
 * "mark attendance for this session" UI on the session detail page.
 * The client embed is intentionally minimal — avatars and other
 * profile fields don't exist on clients yet (clients are not users).
 */
export interface AttendanceWithClient extends AttendanceRow {
  client: {
    id: string;
    name: string;
    email: string | null;
  } | null;
}

// ------------------------------------------------------------------
// Input shapes
// ------------------------------------------------------------------

/**
 * Payment fields are co-required at the DB level
 * (attendance_payment_consistency CHECK in migration 062). The
 * discriminated union here mirrors that invariant in TypeScript so
 * misuse is a compile error, not a runtime DB rejection.
 */
type PaymentFields =
  | {
      amount_paid_cents?: never;
      currency?: never;
      payment_method?: never;
    }
  | {
      amount_paid_cents: number;
      currency: Currency;
      payment_method: PaymentMethod;
    };

export interface CreateClientInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  tags?: string[];
  contact_info?: Record<string, unknown> | null;
  /** Added in migration 072. Optional on create; defaults to 'active' at DB level. */
  status?: ClientStatus;
  /** Added in migration 072. */
  health_notes?: string | null;
}

export interface UpdateClientInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  tags?: string[];
  contact_info?: Record<string, unknown> | null;
  archived?: boolean;
  /** Added in migration 072. */
  status?: ClientStatus;
  /** Added in migration 072. */
  health_notes?: string | null;
}

export type RecordAttendanceInput = {
  client_id: string;
  session_id: string;
  attended: boolean;
  paid: boolean;
  attended_at?: string | null;
  notes?: string | null;
} & PaymentFields;

/**
 * Partial-update shape for an existing attendance row. Every field
 * is optional; absent fields are left unchanged. Payment fields are
 * still co-required when ANY of them is set — the Zod schema for
 * the route enforces that.
 */
export interface UpdateAttendanceInput {
  attended?: boolean;
  paid?: boolean;
  attended_at?: string | null;
  notes?: string | null;
  amount_paid_cents?: number | null;
  currency?: 'USD' | 'COP' | null;
  payment_method?: 'cash' | 'transfer' | 'stripe' | 'other' | null;
}

/**
 * Sort options for the clients list. Defaults to `last_seen_desc`
 * because "who haven't I seen lately" is the most-common scanning
 * question. `name_asc` is for finding-a-specific-person mode.
 * `created_desc` surfaces newly-added clients (e.g. just imported
 * the WhatsApp roster, want to see who's there).
 */
export type ClientListSort = 'last_seen_desc' | 'name_asc' | 'created_desc';

export interface ListClientsFilters {
  searchQuery?: string;
  tag?: string;
  /** Filter by engagement status. Omit for "any status". */
  status?: ClientStatus;
  /** Sort order. Defaults to `last_seen_desc`. */
  sort?: ClientListSort;
}

const CLIENT_SELECT =
  'id, instructor_user_id, gym_id, name, email, phone, contact_info, notes, tags, status, health_notes, last_seen_at, archived, archived_at, created_at, updated_at, churn_risk_score, churn_risk_updated_at, health_status, total_sessions, sessions_last_30_days, current_streak_days, longest_streak_days';

const ATTENDANCE_SELECT =
  'id, client_id, session_id, attended, paid, attended_at, amount_paid_cents, currency, payment_method, notes, refunded_amount_cents, refunded_at, refund_reason, created_at, updated_at';

// ------------------------------------------------------------------
// Clients CRUD
// ------------------------------------------------------------------

/**
 * Create a client. RLS (migration 070) accepts either the legacy
 * instructor path (auth.uid() = instructor_user_id) or the gym path
 * (caller is a coach in the named gym).
 *
 * The DAL writes BOTH columns when a gym context is provided —
 * instructor_user_id stays populated for backward compatibility with
 * any code still reading it, and gym_id is the new source of truth.
 * Callers that pass only an instructorUserId (legacy code path) get a
 * row with gym_id = null; that row is still queryable via the
 * legacy RLS branch.
 */
/**
 * Bulk-create clients. Used by the CSV import flow. Submits one
 * Supabase INSERT with an array of rows so the round-trip cost is
 * O(1) regardless of batch size. Caller is expected to have already
 * validated each row's shape via the per-row Zod schema.
 *
 * Returns the inserted ClientRow array on success. If the bulk
 * insert errors (e.g. a single bad row trips a CHECK constraint),
 * the whole batch fails — Supabase doesn't surface per-row results
 * for an array insert. UX wraps this with a clear "fix the bad row
 * and retry" message rather than silent partial-success.
 */
export async function createClientsBulk(
  supabase: SupabaseClient,
  context: ClientTenantContext,
  inputs: CreateClientInput[]
): Promise<DalResult<ClientRow[]>> {
  if (inputs.length === 0) return { success: true, data: [] };
  const instructorUserId = context.instructorUserId;
  const gymId = context.gymId;
  try {
    const payload = inputs.map((input) => ({
      instructor_user_id: instructorUserId,
      gym_id: gymId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      contact_info: input.contact_info ?? null,
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.health_notes !== undefined ? { health_notes: input.health_notes } : {}),
    }));
    const { data, error } = await supabase.from('clients').insert(payload).select(CLIENT_SELECT);
    if (error) {
      logError(error, { action: 'createClientsBulk', instructorUserId, gymId, count: inputs.length });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data ?? []) as ClientRow[] };
  } catch (error) {
    logError(error, { action: 'createClientsBulk.exception', instructorUserId, gymId, count: inputs.length });
    return { success: false, error: 'Failed to bulk-create clients' };
  }
}

export async function createClient(
  supabase: SupabaseClient,
  context: ClientTenantContext | string,
  input: CreateClientInput
): Promise<DalResult<ClientRow>> {
  // Backward-compat: callers that haven't been refactored yet pass a
  // bare instructorUserId string. Normalize to the context shape.
  const ctx: ClientTenantContext = typeof context === 'string' ? { gymId: null, instructorUserId: context } : context;
  const instructorUserId = ctx.instructorUserId;
  const gymId = ctx.gymId;
  try {
    const { data, error } = await supabase
      .from('clients')
      .insert({
        instructor_user_id: instructorUserId,
        gym_id: gymId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
        tags: input.tags ?? [],
        contact_info: input.contact_info ?? null,
        // status omitted → DB default 'active' applies.
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.health_notes !== undefined ? { health_notes: input.health_notes } : {}),
      })
      .select(CLIENT_SELECT)
      .single();

    if (error) {
      logError(error, { action: 'createClient', instructorUserId, gymId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data as ClientRow };
  } catch (error) {
    logError(error, { action: 'createClient', instructorUserId, gymId });
    return { success: false, error: 'Failed to create client' };
  }
}

/**
 * Partial update. At least one field must be present (enforced by the
 * Mission 3 Zod schema; the DAL does not re-validate). RLS scopes the
 * update to the caller's own clients.
 */
export async function updateClient(
  supabase: SupabaseClient,
  clientId: string,
  updates: UpdateClientInput
): Promise<DalResult<ClientRow>> {
  try {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.tags !== undefined) payload.tags = updates.tags;
    if (updates.contact_info !== undefined) payload.contact_info = updates.contact_info;
    if (updates.archived !== undefined) payload.archived = updates.archived;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.health_notes !== undefined) payload.health_notes = updates.health_notes;

    if (Object.keys(payload).length === 0) {
      return { success: false, error: 'no_updates' };
    }

    const { data, error } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', clientId)
      .select(CLIENT_SELECT)
      .single();

    if (error) {
      logError(error, { action: 'updateClient', clientId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data as ClientRow };
  } catch (error) {
    logError(error, { action: 'updateClient', clientId });
    return { success: false, error: 'Failed to update client' };
  }
}

/**
 * Fetch a single client by id. Returns success+null when not found
 * (or RLS hides it) rather than treating absence as an error — the API
 * layer maps null → 404.
 */
export async function getClient(supabase: SupabaseClient, clientId: string): Promise<DalResult<ClientRow | null>> {
  try {
    const { data, error } = await supabase.from('clients').select(CLIENT_SELECT).eq('id', clientId).maybeSingle();

    if (error) {
      logError(error, { action: 'getClient', clientId });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data as ClientRow | null) ?? null };
  } catch (error) {
    logError(error, { action: 'getClient', clientId });
    return { success: false, error: 'Failed to fetch client' };
  }
}

/**
 * List the instructor's active clients with aggregated attendance stats
 * joined in. Two queries (clients + attendance), aggregated in JS — no
 * GROUP BY through the Supabase JS client. Bounded at one round-trip
 * per call regardless of client count.
 *
 * Sort: most recent attendance first; clients with no attendance fall
 * back to created_at. Archived clients are excluded.
 */
export async function listClients(
  supabase: SupabaseClient,
  context: ClientTenantContext | string,
  filters?: ListClientsFilters
): Promise<DalResult<ClientWithStats[]>> {
  // Backward-compat: callers that haven't been refactored yet pass a
  // bare instructorUserId. Normalize to the context shape.
  const ctx: ClientTenantContext = typeof context === 'string' ? { gymId: null, instructorUserId: context } : context;
  const instructorUserId = ctx.instructorUserId;
  const gymId = ctx.gymId;
  try {
    // Filter strategy: when we have a gymId, scope by gym (preferred,
    // catches rows owned by any coach in the gym). When we only have
    // instructorUserId, scope the legacy way. RLS guarantees neither
    // case can leak rows from a tenant the caller doesn't belong to.
    let q = supabase.from('clients').select(CLIENT_SELECT).eq('archived', false);
    if (gymId) {
      q = q.eq('gym_id', gymId);
    } else {
      q = q.eq('instructor_user_id', instructorUserId);
    }

    if (filters?.searchQuery && filters.searchQuery.trim().length > 0) {
      // Case-insensitive substring match on name. Sequential scan is
      // fine at expected scale (low hundreds of clients per instructor).
      q = q.ilike('name', `%${filters.searchQuery.trim()}%`);
    }
    if (filters?.tag && filters.tag.trim().length > 0) {
      // Array containment: the client's tags array contains this tag.
      // Backed by idx_clients_tags GIN index.
      q = q.contains('tags', [filters.tag.trim()]);
    }
    if (filters?.status) {
      // Exact-match status filter (Week 3 polish, added with the
      // filter-pill UI on /os/clients). The status column has a CHECK
      // constraint so the value space is bounded.
      q = q.eq('status', filters.status);
    }

    const { data: clients, error: clientsErr } = await q;
    if (clientsErr) {
      logError(clientsErr, { action: 'listClients.clients', instructorUserId, gymId });
      return { success: false, error: clientsErr.message };
    }

    const clientRows = (clients ?? []) as ClientRow[];
    if (clientRows.length === 0) {
      return { success: true, data: [] };
    }

    const clientIds = clientRows.map((c) => c.id);

    const { data: attendance, error: attErr } = await supabase
      .from('client_attendance')
      .select('client_id, attended, attended_at, paid, amount_paid_cents, currency')
      .in('client_id', clientIds);
    if (attErr) {
      logError(attErr, { action: 'listClients.attendance', instructorUserId, gymId });
      return { success: false, error: attErr.message };
    }

    const statsByClient = aggregateAttendance(
      (attendance ?? []) as Array<{
        client_id: string;
        attended: boolean;
        attended_at: string | null;
        paid: boolean;
        amount_paid_cents: number | null;
        currency: Currency | null;
      }>
    );

    const enriched: ClientWithStats[] = clientRows.map((c) => {
      const stats = statsByClient.get(c.id) ?? emptyStats();
      return {
        ...c,
        last_attendance_at: stats.last_attendance_at,
        total_attended_count: stats.total_attended_count,
        total_paid_cents_usd: stats.total_paid_cents_usd,
        total_paid_cents_cop: stats.total_paid_cents_cop,
      };
    });

    const sortKey: ClientListSort = filters?.sort ?? 'last_seen_desc';
    enriched.sort((a, b) => {
      switch (sortKey) {
        case 'name_asc':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        case 'created_desc':
          return b.created_at.localeCompare(a.created_at);
        case 'last_seen_desc':
        default:
          // Most recent attendance first, NULLS last. Tie-break
          // by created_at desc so two clients who've never been
          // marked attended sort by newest-added first.
          if (a.last_attendance_at && b.last_attendance_at) {
            return b.last_attendance_at.localeCompare(a.last_attendance_at);
          }
          if (a.last_attendance_at) return -1;
          if (b.last_attendance_at) return 1;
          return b.created_at.localeCompare(a.created_at);
      }
    });

    return { success: true, data: enriched };
  } catch (error) {
    logError(error, { action: 'listClients', instructorUserId, gymId });
    return { success: false, error: 'Failed to list clients' };
  }
}

/**
 * Soft delete via the archived flag (per migration 062 design). Keeps
 * attendance history queryable for revenue aggregations even after a
 * client is removed from the active roster. The trigger on UPDATE syncs
 * archived_at automatically.
 */
export async function deleteClient(supabase: SupabaseClient, clientId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('clients').update({ archived: true }).eq('id', clientId);
    if (error) {
      logError(error, { action: 'deleteClient', clientId });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteClient', clientId });
    return { success: false, error: 'Failed to delete client' };
  }
}

/**
 * Hard delete — GDPR-style data removal. Drops the client row and
 * cascades to: client_attendance, training_partners (both sides),
 * community_insight_members, gym_team_members. All ON DELETE CASCADE
 * relationships are set in their respective migrations (062 / 074 /
 * 075), so a single DELETE on clients.id is sufficient.
 *
 * This is irreversible. Use deleteClient (soft) for "remove from
 * active roster" and this for "the member exercised their right to
 * have all their data wiped."
 *
 * Notes that DO NOT cascade and need explicit cleanup:
 *   - community_insights rows that reference ONLY this client (via
 *     community_insight_members) get orphaned. We don't delete them
 *     here because the insight may have been generated for a now-
 *     deleted member but read by the coach historically. The audit
 *     trail in the insight (severity / type / created_at) stays
 *     useful; only the personal link to the member disappears.
 *
 * If you want to also purge orphaned insights, call cleanupGymSampleData-
 * style cleanup separately. For most GDPR purposes the
 * insight_member link removal is sufficient.
 */
export async function purgeClient(supabase: SupabaseClient, clientId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('clients').delete().eq('id', clientId);
    if (error) {
      logError(error, { action: 'purgeClient', clientId });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'purgeClient.exception', clientId });
    return { success: false, error: 'Failed to purge client' };
  }
}

// ------------------------------------------------------------------
// Attendance CRUD + history reads — moved to
// ./clients.attendance.ts during the Phase 2 refactor (2026-05-14).
// Re-exported below so existing imports stay green.
// ------------------------------------------------------------------
export {
  recordAttendance,
  updateAttendance,
  deleteAttendance,
  refundAttendance,
  listAttendanceForClient,
  listAttendanceForSession,
  getClientAttendanceSummary,
  type DeletedAttendanceSnapshot,
  type RefundAttendanceInput,
  type RefundedAttendanceSnapshot,
  type RefundAttendanceError,
} from './clients.attendance';

// ------------------------------------------------------------------
// Unpaid attendance roll-up — moved to ./clients.unpaid.ts during the
// Phase 2 refactor (2026-05-14). Re-exported below so existing
// imports stay green.
// ------------------------------------------------------------------
export {
  listUnpaidAttendance,
  type UnpaidClientGroup,
  type ListUnpaidAttendanceOptions,
  type UnpaidAttendanceResult,
} from './clients.unpaid';

// ------------------------------------------------------------------
// Insights roll-ups (at-risk + active streakers) — moved to
// ./clients.insights.ts during the Phase 2 refactor (2026-05-14).
// Re-exported below so existing imports stay green.
// ------------------------------------------------------------------
export {
  listAtRiskClients,
  listActiveStreakers,
  type AtRiskClient,
  type ActiveStreaker,
  type ListAtRiskClientsOptions,
  type ListActiveStreakersOptions,
} from './clients.insights';

// ------------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------------

function emptyStats(): ClientAttendanceSummary {
  return {
    total_attended_count: 0,
    total_paid_cents_usd: 0,
    total_paid_cents_cop: 0,
    last_attendance_at: null,
  };
}

function aggregateAttendance(
  rows: Array<{
    client_id: string;
    attended: boolean;
    attended_at: string | null;
    paid: boolean;
    amount_paid_cents: number | null;
    currency: Currency | null;
  }>
): Map<string, ClientAttendanceSummary> {
  const out = new Map<string, ClientAttendanceSummary>();
  for (const r of rows) {
    const stats = out.get(r.client_id) ?? emptyStats();
    if (r.attended) {
      stats.total_attended_count += 1;
      if (r.attended_at && (!stats.last_attendance_at || r.attended_at > stats.last_attendance_at)) {
        stats.last_attendance_at = r.attended_at;
      }
    }
    if (r.amount_paid_cents != null) {
      if (r.currency === 'USD') stats.total_paid_cents_usd += r.amount_paid_cents;
      else if (r.currency === 'COP') stats.total_paid_cents_cop += r.amount_paid_cents;
    }
    out.set(r.client_id, stats);
  }
  return out;
}

// ------------------------------------------------------------------
// CSV exports — moved to ./clients.csv.ts during the Phase 2 refactor
// (2026-05-14). Re-exported below so existing imports stay green.
// ------------------------------------------------------------------
export { generateClientsCsv, generateAttendanceCsv, type GenerateClientsCsvOptions } from './clients.csv';
