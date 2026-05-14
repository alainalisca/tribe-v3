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
// Attendance
// ------------------------------------------------------------------

/**
 * Record (or update) attendance for a (client, session) pair. UPSERT
 * on the unique constraint — idempotent: re-marking attendance for the
 * same pair updates the existing row rather than creating a duplicate.
 *
 * Payment fields are co-required at the type level; passing
 * amount_paid_cents without currency is a TypeScript error before it
 * ever reaches the DB CHECK constraint.
 */
export async function recordAttendance(
  supabase: SupabaseClient,
  input: RecordAttendanceInput
): Promise<DalResult<AttendanceRow>> {
  try {
    const { data, error } = await supabase
      .from('client_attendance')
      .upsert(
        {
          client_id: input.client_id,
          session_id: input.session_id,
          attended: input.attended,
          paid: input.paid,
          attended_at: input.attended_at ?? (input.attended ? new Date().toISOString() : null),
          amount_paid_cents: input.amount_paid_cents ?? null,
          currency: input.currency ?? null,
          payment_method: input.payment_method ?? null,
          notes: input.notes ?? null,
        },
        { onConflict: 'client_id,session_id' }
      )
      .select(ATTENDANCE_SELECT)
      .single();

    if (error) {
      logError(error, {
        action: 'recordAttendance',
        clientId: input.client_id,
        sessionId: input.session_id,
      });
      return { success: false, error: error.message };
    }
    return { success: true, data: data as AttendanceRow };
  } catch (error) {
    logError(error, {
      action: 'recordAttendance',
      clientId: input.client_id,
      sessionId: input.session_id,
    });
    return { success: false, error: 'Failed to record attendance' };
  }
}

/**
 * Partial-update an attendance row. Used when the coach realizes
 * they recorded the wrong status (attended=true → false), need to
 * fix a payment amount, or want to flip paid → unpaid after a refund.
 *
 * The 079 counter trigger refires on UPDATE OF attended / attended_at,
 * so the client's cached counters stay correct after this call. The
 * 076 partner trigger only fires on false → true transitions (handled),
 * so flipping attended back to false leaves the partner edges in
 * place — that's intentional, partial history shouldn't blow away
 * the community graph.
 *
 * RLS scopes the UPDATE to attendance rows the caller can see; the
 * client_id ownership chain runs through the parent client.
 */
export async function updateAttendance(
  supabase: SupabaseClient,
  attendanceId: string,
  updates: UpdateAttendanceInput
): Promise<DalResult<AttendanceRow>> {
  try {
    const payload: Record<string, unknown> = {};
    if (updates.attended !== undefined) payload.attended = updates.attended;
    if (updates.paid !== undefined) payload.paid = updates.paid;
    if (updates.attended_at !== undefined) payload.attended_at = updates.attended_at;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (updates.amount_paid_cents !== undefined) payload.amount_paid_cents = updates.amount_paid_cents;
    if (updates.currency !== undefined) payload.currency = updates.currency;
    if (updates.payment_method !== undefined) payload.payment_method = updates.payment_method;

    if (Object.keys(payload).length === 0) {
      return { success: false, error: 'no_updates' };
    }

    const { data, error } = await supabase
      .from('client_attendance')
      .update(payload)
      .eq('id', attendanceId)
      .select(ATTENDANCE_SELECT)
      .single();

    if (error) {
      logError(error, { action: 'updateAttendance', attendanceId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data as AttendanceRow };
  } catch (error) {
    logError(error, { action: 'updateAttendance.exception', attendanceId });
    return { success: false, error: 'Failed to update attendance' };
  }
}

/** Snapshot of an attendance row, captured during delete for forensics. */
export interface DeletedAttendanceSnapshot {
  id: string;
  client_id: string;
  session_id: string;
  attended: boolean;
  paid: boolean;
  amount_paid_cents: number | null;
  currency: string | null;
  /** Gym id resolved via the joined client. Null if the client row was already gone. */
  gym_id: string | null;
}

/**
 * Hard-delete an attendance row. The 079 counter trigger fires on
 * DELETE so the client's cached counters update automatically. Use
 * sparingly — usually editing the row is the right move; deletion
 * is for "this was recorded for the wrong client entirely."
 *
 * Returns a snapshot of the deleted row so the caller can write a
 * forensic audit entry (action: 'attendance.delete') without a
 * separate pre-delete fetch. The snapshot covers money-relevant
 * fields (paid, amount_paid_cents, currency) because attendance
 * deletion can erase recorded revenue and we want a paper trail.
 */
export async function deleteAttendance(
  supabase: SupabaseClient,
  attendanceId: string
): Promise<DalResult<DeletedAttendanceSnapshot | null>> {
  try {
    // .delete().select() returns the deleted rows (Postgres RETURNING).
    // We also pull the parent client's gym_id in the same round trip
    // so the route handler can call writeAuditEntry with the correct
    // gymId without a follow-up query.
    const { data, error } = await supabase
      .from('client_attendance')
      .delete()
      .eq('id', attendanceId)
      .select(
        `
          id, client_id, session_id, attended, paid, amount_paid_cents, currency,
          client:clients(gym_id)
        `
      )
      .maybeSingle();
    if (error) {
      logError(error, { action: 'deleteAttendance', attendanceId });
      return { success: false, error: error.message };
    }
    if (!data) {
      // Row didn't exist (already deleted, or RLS hid it). Return success
      // with null snapshot — the caller treats this as a no-op.
      return { success: true, data: null };
    }
    const client = data.client as unknown as { gym_id: string | null } | null;
    const snapshot: DeletedAttendanceSnapshot = {
      id: data.id as string,
      client_id: data.client_id as string,
      session_id: data.session_id as string,
      attended: data.attended as boolean,
      paid: data.paid as boolean,
      amount_paid_cents: (data.amount_paid_cents as number | null) ?? null,
      currency: (data.currency as string | null) ?? null,
      gym_id: client?.gym_id ?? null,
    };
    return { success: true, data: snapshot };
  } catch (error) {
    logError(error, { action: 'deleteAttendance.exception', attendanceId });
    return { success: false, error: 'Failed to delete attendance' };
  }
}

export interface RefundAttendanceInput {
  /** Refund amount in minor units. Must be > 0 and <= amount_paid_cents. */
  refundedAmountCents: number;
  /** Free-text reason, 1-500 chars. Recorded for accounting + audit. */
  refundReason: string;
}

/** Snapshot returned after a successful refund. Drives the audit-log payload. */
export interface RefundedAttendanceSnapshot {
  id: string;
  client_id: string;
  session_id: string;
  amount_paid_cents: number | null;
  refunded_amount_cents: number;
  currency: Currency | null;
  refund_reason: string;
  refunded_at: string;
  /** Gym id, resolved via the joined client. Null when the parent client row is gone. */
  gym_id: string | null;
}

/** Discriminated error codes from refundAttendance. Mapped to HTTP status in the route. */
export type RefundAttendanceError =
  | 'not_found' // attendance row doesn't exist (or RLS hid it)
  | 'not_paid' // can't refund an attendance that was never paid
  | 'already_refunded' // already has a refund recorded; this DAL is single-event today
  | 'amount_invalid' // refundedAmountCents not in (0, amount_paid_cents]
  | 'reason_invalid' // refund reason missing or too long
  | 'db_error';

const MAX_REFUND_REASON_LENGTH = 500;

/**
 * Record a refund against a previously-paid attendance row.
 *
 * Single-event-per-row by design: today we don't accept multiple
 * partial refunds against the same attendance. A coach who needs
 * to refund twice can delete and re-record, or we extend to a
 * separate `attendance_refunds` table later. The simple shape
 * covers ~99% of cases without the complexity.
 *
 * Validation runs in TS BEFORE hitting the DB so we can return
 * clear error codes. The migration's CHECK constraint is the
 * belt-and-suspenders backstop.
 *
 * On success, returns a snapshot suitable for writing an
 * `attendance.refund` audit-log entry.
 */
export async function refundAttendance(
  supabase: SupabaseClient,
  attendanceId: string,
  input: RefundAttendanceInput
): Promise<DalResult<RefundedAttendanceSnapshot>> {
  const reason = input.refundReason?.trim() ?? '';
  if (reason.length === 0 || reason.length > MAX_REFUND_REASON_LENGTH) {
    return { success: false, error: 'reason_invalid' satisfies RefundAttendanceError };
  }
  if (!Number.isFinite(input.refundedAmountCents) || input.refundedAmountCents <= 0) {
    return { success: false, error: 'amount_invalid' satisfies RefundAttendanceError };
  }
  const refundedAmountCents = Math.round(input.refundedAmountCents);

  try {
    // Load the row first so we can validate the refund amount against
    // amount_paid_cents and reject duplicate refunds early with a
    // friendly error code. RLS still gates the read.
    const { data: existing, error: existingErr } = await supabase
      .from('client_attendance')
      .select(
        `
          id, client_id, session_id, paid, amount_paid_cents, currency,
          refunded_amount_cents,
          client:clients(gym_id)
        `
      )
      .eq('id', attendanceId)
      .maybeSingle();
    if (existingErr) {
      logError(existingErr, { action: 'refundAttendance.lookup', attendanceId });
      return { success: false, error: 'db_error' satisfies RefundAttendanceError };
    }
    if (!existing) {
      return { success: false, error: 'not_found' satisfies RefundAttendanceError };
    }
    if (!existing.paid || existing.amount_paid_cents === null || existing.amount_paid_cents <= 0) {
      return { success: false, error: 'not_paid' satisfies RefundAttendanceError };
    }
    if (existing.refunded_amount_cents !== null) {
      return { success: false, error: 'already_refunded' satisfies RefundAttendanceError };
    }
    if (refundedAmountCents > (existing.amount_paid_cents as number)) {
      return { success: false, error: 'amount_invalid' satisfies RefundAttendanceError };
    }

    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('client_attendance')
      .update({
        refunded_amount_cents: refundedAmountCents,
        refunded_at: nowIso,
        refund_reason: reason,
      })
      .eq('id', attendanceId);
    if (updateErr) {
      logError(updateErr, { action: 'refundAttendance.update', attendanceId });
      return { success: false, error: 'db_error' satisfies RefundAttendanceError };
    }

    const client = existing.client as unknown as { gym_id: string | null } | null;
    const snapshot: RefundedAttendanceSnapshot = {
      id: existing.id as string,
      client_id: existing.client_id as string,
      session_id: existing.session_id as string,
      amount_paid_cents: (existing.amount_paid_cents as number | null) ?? null,
      refunded_amount_cents: refundedAmountCents,
      currency: (existing.currency as Currency | null) ?? null,
      refund_reason: reason,
      refunded_at: nowIso,
      gym_id: client?.gym_id ?? null,
    };
    return { success: true, data: snapshot };
  } catch (error) {
    logError(error, { action: 'refundAttendance.exception', attendanceId });
    return { success: false, error: 'db_error' satisfies RefundAttendanceError };
  }
}

/**
 * Attendance history for one client, joined with each session's display
 * fields. Newest attendance first.
 */
export async function listAttendanceForClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<DalResult<AttendanceWithSession[]>> {
  try {
    const { data, error } = await supabase
      .from('client_attendance')
      .select(`${ATTENDANCE_SELECT}, session:sessions(id, title, sport, date, start_time)`)
      .eq('client_id', clientId)
      .order('attended_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      logError(error, { action: 'listAttendanceForClient', clientId });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data ?? []) as unknown as AttendanceWithSession[] };
  } catch (error) {
    logError(error, { action: 'listAttendanceForClient', clientId });
    return { success: false, error: 'Failed to load attendance history' };
  }
}

/**
 * Attendance for one session, scoped to clients owned by this
 * instructor. RLS already filters to the caller's own clients via the
 * client_attendance policy, but we additionally filter by the session
 * id at the query level.
 *
 * The `instructor_user_id` parameter is currently unused at the query
 * level (RLS does the work) — it's accepted to make the API caller's
 * intent explicit and so we can layer in caching keyed on (session,
 * instructor) later without changing the signature.
 */
export async function listAttendanceForSession(
  supabase: SupabaseClient,
  sessionId: string,
  _instructorUserId: string
): Promise<DalResult<AttendanceWithClient[]>> {
  try {
    const { data, error } = await supabase
      .from('client_attendance')
      .select(`${ATTENDANCE_SELECT}, client:clients(id, name, email)`)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) {
      logError(error, { action: 'listAttendanceForSession', sessionId });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data ?? []) as unknown as AttendanceWithClient[] };
  } catch (error) {
    logError(error, { action: 'listAttendanceForSession', sessionId });
    return { success: false, error: 'Failed to load attendance for session' };
  }
}

/**
 * Aggregate stats for one client. Used by the client detail page.
 * Returns a zero-row summary (counts + totals = 0, last attendance =
 * null) when the client has no attendance recorded.
 */
export async function getClientAttendanceSummary(
  supabase: SupabaseClient,
  clientId: string
): Promise<DalResult<ClientAttendanceSummary>> {
  try {
    const { data, error } = await supabase
      .from('client_attendance')
      .select('attended, attended_at, amount_paid_cents, currency')
      .eq('client_id', clientId);

    if (error) {
      logError(error, { action: 'getClientAttendanceSummary', clientId });
      return { success: false, error: error.message };
    }

    const rows = (data ?? []) as Array<{
      attended: boolean;
      attended_at: string | null;
      amount_paid_cents: number | null;
      currency: Currency | null;
    }>;

    const summary: ClientAttendanceSummary = {
      total_attended_count: 0,
      total_paid_cents_usd: 0,
      total_paid_cents_cop: 0,
      last_attendance_at: null,
    };
    for (const r of rows) {
      if (r.attended) {
        summary.total_attended_count += 1;
        if (r.attended_at && (!summary.last_attendance_at || r.attended_at > summary.last_attendance_at)) {
          summary.last_attendance_at = r.attended_at;
        }
      }
      if (r.amount_paid_cents != null) {
        if (r.currency === 'USD') summary.total_paid_cents_usd += r.amount_paid_cents;
        else if (r.currency === 'COP') summary.total_paid_cents_cop += r.amount_paid_cents;
      }
    }
    return { success: true, data: summary };
  } catch (error) {
    logError(error, { action: 'getClientAttendanceSummary', clientId });
    return { success: false, error: 'Failed to load attendance summary' };
  }
}

// ------------------------------------------------------------------
// Unpaid attendance roll-up (revenue collection workflow)
// ------------------------------------------------------------------

/**
 * One row per client with at least one unpaid (attended but not paid)
 * attendance in the window. Powers the /os/revenue/unpaid surface.
 *
 * We deliberately don't try to compute an "amount owed" — the
 * attendance table only records `amount_paid_cents` (NULL when unpaid),
 * there's no per-session "price list" today. Coaches know their own
 * pricing; the surface answers "who do I need to nudge?" not "send
 * the exact dollar amount."
 */
export interface UnpaidClientGroup {
  client_id: string;
  client_name: string;
  /** Free-form phone. Drives WhatsApp deep links; nullable. */
  client_phone: string | null;
  client_email: string | null;
  /** Number of unpaid (attended, !paid) rows in the window. */
  unpaid_count: number;
  /** Earliest attended_at among the unpaid rows. ISO date string. */
  oldest_unpaid_at: string;
  /** Most recent attended_at among the unpaid rows. ISO date string. */
  newest_unpaid_at: string;
}

export interface ListUnpaidAttendanceOptions {
  /**
   * Look-back window in days. Defaults to 60. Older unpaid sessions
   * are excluded — at some point they're not actionable as a payment
   * reminder, they're write-offs the coach should handle in their
   * books. 60 days strikes the balance: covers a missed month of
   * monthly billing without surfacing year-old debt.
   */
  windowDays?: number;
  /**
   * Look-back window for the "typical session price" inference.
   * Defaults to 180 days — wide enough to get a meaningful sample
   * from a low-volume gym while still excluding ancient prices that
   * may no longer reflect current rates.
   */
  pricingWindowDays?: number;
}

const DEFAULT_UNPAID_WINDOW_DAYS = 60;
const DEFAULT_PRICING_WINDOW_DAYS = 180;
const MIN_PRICING_SAMPLE_SIZE = 3;

/**
 * Result of `listUnpaidAttendance` — the grouped unpaid rows alongside
 * inferred "typical session price" per currency.
 */
export interface UnpaidAttendanceResult {
  groups: UnpaidClientGroup[];
  /**
   * Median paid amount per currency in cents, computed from this gym's
   * own historical paid attendance in the pricing window. Powers a
   * "Typical session: $20 USD" hint on /os/revenue/unpaid + lets the
   * WhatsApp template include a specific number instead of vague
   * "let's settle up" copy.
   *
   * A currency key is present only when we have at least
   * MIN_PRICING_SAMPLE_SIZE paid rows in that currency. Smaller samples
   * produce noisy medians ("your typical session is $1.50 because the
   * only paid row in COP was a typo last March") — better to surface
   * nothing than to surface garbage.
   */
  suggested_amount_cents: Partial<Record<Currency, number>>;
}

/**
 * Compute the median of an integer array. Empty input → null.
 * Uses the lower-middle for even-length arrays — we want a value
 * that exists in the data, not an interpolated one, so the figure
 * we surface reflects a real paid session.
 */
function medianCentsLowerMiddle(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Lower-middle index: for [10, 20, 30, 40] returns sorted[1] = 20.
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * Group every unpaid (attended, !paid) attendance row in the gym
 * into one entry per client, ordered by most-recent unpaid first
 * (the assumption being: a client with a fresh unpaid session is
 * the most likely to pay if nudged today). Also computes a
 * gym-wide typical session price per currency from the same gym's
 * paid history.
 *
 * Scoping comes through RLS — the client_attendance policy already
 * scopes to the caller's clients via the parent client row.
 */
export async function listUnpaidAttendance(
  supabase: SupabaseClient,
  opts: ListUnpaidAttendanceOptions = {}
): Promise<DalResult<UnpaidAttendanceResult>> {
  const windowDays = Math.max(1, Math.floor(opts.windowDays ?? DEFAULT_UNPAID_WINDOW_DAYS));
  const pricingWindowDays = Math.max(1, Math.floor(opts.pricingWindowDays ?? DEFAULT_PRICING_WINDOW_DAYS));
  // Build a cutoff ISO string for the SQL filter. attended_at is the
  // event time; we keep created_at out of the filter so a freshly
  // RECORDED-but-backdated row still shows up.
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const pricingCutoff = new Date(Date.now() - pricingWindowDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Parallel: unpaid rows for grouping + paid rows for price
    // inference. RLS scopes both reads to the caller's clients.
    const [unpaidRes, pricingRes] = await Promise.all([
      supabase
        .from('client_attendance')
        .select(
          `
            attended_at, attended, paid, client_id,
            client:clients(id, name, email, phone, archived)
          `
        )
        .eq('attended', true)
        .eq('paid', false)
        .gte('attended_at', cutoff)
        .order('attended_at', { ascending: false, nullsFirst: false }),
      supabase
        .from('client_attendance')
        .select('amount_paid_cents, currency')
        .eq('paid', true)
        .gte('attended_at', pricingCutoff)
        .not('amount_paid_cents', 'is', null)
        .not('currency', 'is', null),
    ]);
    const { data, error } = unpaidRes;
    if (error) {
      logError(error, { action: 'listUnpaidAttendance' });
      return { success: false, error: error.message };
    }
    if (pricingRes.error) {
      // Don't fail the whole request over a pricing read; the page
      // still renders without the typical-price hint.
      logError(pricingRes.error, { action: 'listUnpaidAttendance.pricing' });
    }

    // Group client-side. Could push this into a SQL view, but the
    // expected payload is small (a gym with 30 active members and a
    // 60-day window rarely exceeds a few hundred rows) and the
    // group-by logic stays in TS where the test surface is friendlier.
    const groups = new Map<string, UnpaidClientGroup>();
    for (const row of data ?? []) {
      const client = row.client as unknown as {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        archived: boolean;
      } | null;
      // Skip rows whose parent client was archived — those usually
      // aren't actionable as a payment reminder.
      if (!client || client.archived) continue;
      const attendedAt = (row.attended_at as string | null) ?? '';
      if (!attendedAt) continue;

      const existing = groups.get(client.id);
      if (!existing) {
        groups.set(client.id, {
          client_id: client.id,
          client_name: client.name,
          client_phone: client.phone,
          client_email: client.email,
          unpaid_count: 1,
          oldest_unpaid_at: attendedAt,
          newest_unpaid_at: attendedAt,
        });
      } else {
        existing.unpaid_count += 1;
        if (attendedAt < existing.oldest_unpaid_at) existing.oldest_unpaid_at = attendedAt;
        if (attendedAt > existing.newest_unpaid_at) existing.newest_unpaid_at = attendedAt;
      }
    }

    const result = Array.from(groups.values()).sort((a, b) =>
      // Most-recent unpaid first. Clients with fresh debt are the
      // ones most worth nudging today.
      b.newest_unpaid_at.localeCompare(a.newest_unpaid_at)
    );

    // Bucket paid amounts by currency, then take the median per
    // bucket if we have a meaningful sample. The MIN_PRICING_SAMPLE_SIZE
    // floor protects against absurd values from a one-off price typo.
    const byCurrency = new Map<Currency, number[]>();
    for (const row of pricingRes.data ?? []) {
      const cents = row.amount_paid_cents as number | null;
      const currency = row.currency as Currency | null;
      if (!cents || !currency || cents <= 0) continue;
      const bucket = byCurrency.get(currency) ?? [];
      bucket.push(cents);
      byCurrency.set(currency, bucket);
    }
    const suggestedAmounts: Partial<Record<Currency, number>> = {};
    for (const [currency, values] of byCurrency.entries()) {
      if (values.length < MIN_PRICING_SAMPLE_SIZE) continue;
      const median = medianCentsLowerMiddle(values);
      if (median !== null) suggestedAmounts[currency] = median;
    }

    return {
      success: true,
      data: { groups: result, suggested_amount_cents: suggestedAmounts },
    };
  } catch (error) {
    logError(error, { action: 'listUnpaidAttendance.exception' });
    return { success: false, error: 'Failed to load unpaid attendance' };
  }
}

// ------------------------------------------------------------------
// At-risk roster query (Week 2 Mission 5)
// ------------------------------------------------------------------

/** A client flagged as at-risk by the dashboard widget. */
export interface AtRiskClient {
  id: string;
  name: string;
  email: string | null;
  /**
   * Phone (raw, as entered). The widget uses this to build a WhatsApp
   * deep-link for one-click follow-up; nullable because not every
   * client record has a phone on file.
   */
  phone: string | null;
  status: ClientStatus;
  last_seen_at: string | null;
  /**
   * Days since last_seen_at, computed by the DAL. Null when
   * last_seen_at is null (the client has never been marked attended).
   */
  days_since_last_seen: number | null;
}

export interface ListAtRiskClientsOptions {
  /**
   * Threshold in days. A client with status='active' and last_seen_at
   * older than this many days counts as at-risk. Defaults to 14.
   */
  thresholdDays?: number;
  /** Max rows to return. Defaults to 25. */
  limit?: number;
  /**
   * Filter to members of one team only. Multi-team gyms (Morning
   * Crew, Evening Crew, Competition Squad) use this to scope the
   * widget per coach's responsibility. When omitted, returns
   * everyone in the gym/instructor scope regardless of team
   * membership — preserves the original behavior.
   */
  teamId?: string;
}

/**
 * Lists clients who appear to have stopped showing up. Used by the
 * `/os/dashboard` at-risk widget. Three categories qualify:
 *
 *   1. status = 'active' AND last_seen_at older than thresholdDays.
 *      The instructor hasn't manually marked them as inactive or
 *      lapsed yet, but the data says they have stopped.
 *   2. status = 'lapsed' (regardless of last_seen_at). Manual
 *      override — the instructor knows they have stopped.
 *   3. status = 'active' AND last_seen_at IS NULL AND the client was
 *      created more than thresholdDays ago. Onboarded but never
 *      attended — likely a stalled lead.
 *
 * Inactive and lead clients are NOT flagged: inactive is the
 * instructor's explicit "stopped, not at-risk" signal, and lead is
 * "not started yet" which is fine.
 *
 * Returned ordered by oldest last_seen_at first (most urgent), then by
 * created_at (oldest onboarding) for the never-attended set.
 */
export async function listAtRiskClients(
  supabase: SupabaseClient,
  context: ClientTenantContext | string,
  options: ListAtRiskClientsOptions = {}
): Promise<DalResult<AtRiskClient[]>> {
  const ctx: ClientTenantContext = typeof context === 'string' ? { gymId: null, instructorUserId: context } : context;
  const instructorUserId = ctx.instructorUserId;
  const gymId = ctx.gymId;

  const thresholdDays = Math.max(1, Math.floor(options.thresholdDays ?? 14));
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100));

  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - thresholdDays);
    const cutoffIso = cutoff.toISOString();

    // When a team filter is in play, INNER-JOIN through
    // gym_team_members so PostgREST acts as a filter that drops
    // any client without a matching team membership. The selected
    // shape `team_membership:gym_team_members!inner(team_id)`
    // lets us subsequently `.eq('team_membership.team_id', teamId)`
    // to scope the join. Without a team filter we use the plain
    // SELECT — no extra cost on the common path.
    const baseSelect = options.teamId
      ? 'id, name, email, phone, status, health_status, churn_risk_score, last_seen_at, created_at, team_membership:gym_team_members!inner(team_id)'
      : 'id, name, email, phone, status, health_status, churn_risk_score, last_seen_at, created_at';

    let q = supabase.from('clients').select(baseSelect).eq('archived', false);

    if (gymId) {
      q = q.eq('gym_id', gymId);
    } else {
      q = q.eq('instructor_user_id', instructorUserId);
    }

    if (options.teamId) {
      q = q.eq('team_membership.team_id', options.teamId);
    }

    // FOUR OR branches now that the AI scoring populates
    // health_status:
    //   1. health_status = 'AT_RISK' (AI flagged them) — primary path
    //   2. status = 'lapsed' (instructor manual override)
    //   3. status = 'active' AND stale last_seen
    //   4. status = 'active' AND last_seen IS NULL AND created early enough
    // Inactive members are intentionally excluded — that's a
    // "stopped on purpose" state.
    q = q.or(
      `health_status.eq.AT_RISK,status.eq.lapsed,and(status.eq.active,last_seen_at.lt.${cutoffIso}),and(status.eq.active,last_seen_at.is.null,created_at.lt.${cutoffIso})`
    );

    // Order: AI-scored AT_RISK first (highest churn_risk_score),
    // then oldest last_seen, then oldest created.
    q = q
      .order('churn_risk_score', { ascending: false, nullsFirst: false })
      .order('last_seen_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    q = q.limit(limit);

    const { data, error } = await q;
    if (error) {
      logError(error, { action: 'listAtRiskClients', instructorUserId, gymId });
      return { success: false, error: error.message };
    }

    // The dynamic select string defeats PostgREST's static parser
    // when teamId is set (it can't statically know the join shape).
    // Double-cast through unknown to take responsibility for the row
    // shape ourselves — the AS contract is still enforced by the
    // explicit interface below.
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      status: ClientStatus;
      health_status: 'HEALTHY' | 'WATCH' | 'AT_RISK' | null;
      churn_risk_score: number | null;
      last_seen_at: string | null;
      created_at: string;
    }>;

    const now = Date.now();
    const out: AtRiskClient[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      status: r.status,
      last_seen_at: r.last_seen_at,
      days_since_last_seen: r.last_seen_at
        ? Math.floor((now - new Date(r.last_seen_at).getTime()) / (24 * 60 * 60 * 1000))
        : null,
    }));

    return { success: true, data: out };
  } catch (error) {
    logError(error, { action: 'listAtRiskClients', instructorUserId, gymId });
    return { success: false, error: 'Failed to list at-risk clients' };
  }
}

// ------------------------------------------------------------------
// Active-streakers roll-up ("Celebrate these wins" dashboard widget)
// ------------------------------------------------------------------

/**
 * A client currently on a meaningful active streak. Surfaced on the
 * /os/dashboard "Celebrate these wins" widget so the coach can fire
 * a personal congratulations via WhatsApp — the mirror image of the
 * at-risk widget, which surfaces members slipping away.
 */
export interface ActiveStreaker {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  current_streak_days: number;
  longest_streak_days: number;
  last_seen_at: string | null;
}

export interface ListActiveStreakersOptions {
  /**
   * Minimum streak in days to qualify. Defaults to 7 — a "Week
   * strong" milestone is the floor for a "this is worth
   * celebrating" moment. Coaches praising every 3-day streak
   * turns into noise; 7+ is the meaningful threshold.
   */
  minStreakDays?: number;
  /**
   * Stale-streak guard. If a client's `current_streak_days` says 10
   * but their `last_seen_at` is 14 days ago, the cached counter has
   * drifted (typically because the nightly streak-decay job hasn't
   * run yet). We exclude streakers whose last_seen_at is older than
   * this many days. Defaults to 7 — "still actively training."
   */
  staleAfterDays?: number;
  /** Max rows. Defaults to 10 — the widget renders cards, more than ~10 overflows. */
  limit?: number;
  /**
   * Filter to members of one team only. Mirrors ListAtRiskClientsOptions.teamId —
   * multi-team gyms scope the celebrate-wins widget per coach's
   * responsibility.
   */
  teamId?: string;
}

const DEFAULT_MIN_STREAK_DAYS = 7;
const DEFAULT_STALE_AFTER_DAYS = 7;
const DEFAULT_STREAKERS_LIMIT = 10;

/**
 * Lists clients currently on an active streak of `minStreakDays` or
 * more, ordered by `current_streak_days` DESC. The longest active
 * streakers show first — coaches see "Carlos is on day 47" before
 * "Ana is on day 7" so the most impressive wins get acknowledged.
 *
 * Stale-streak guard: filters out clients whose `last_seen_at` is
 * older than `staleAfterDays`. The counter trigger from migration
 * 079 keeps these accurate on every write, but if the database is
 * in an inconsistent state (rare) we don't want to celebrate a
 * streak that's actually broken.
 *
 * Archived clients are excluded. Status doesn't matter — a 'lead'
 * client who's been showing up every day deserves the praise as
 * much as an 'active' one.
 */
export async function listActiveStreakers(
  supabase: SupabaseClient,
  context: ClientTenantContext | string,
  options: ListActiveStreakersOptions = {}
): Promise<DalResult<ActiveStreaker[]>> {
  const ctx: ClientTenantContext = typeof context === 'string' ? { gymId: null, instructorUserId: context } : context;
  const instructorUserId = ctx.instructorUserId;
  const gymId = ctx.gymId;

  const minStreakDays = Math.max(1, Math.floor(options.minStreakDays ?? DEFAULT_MIN_STREAK_DAYS));
  const staleAfterDays = Math.max(1, Math.floor(options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS));
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_STREAKERS_LIMIT, 50));

  try {
    const staleCutoffIso = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1000).toISOString();

    // Team filter via INNER JOIN through gym_team_members. Same
    // pattern as listAtRiskClients — see the comment there.
    const baseSelect = options.teamId
      ? 'id, name, email, phone, current_streak_days, longest_streak_days, last_seen_at, team_membership:gym_team_members!inner(team_id)'
      : 'id, name, email, phone, current_streak_days, longest_streak_days, last_seen_at';

    let q = supabase
      .from('clients')
      .select(baseSelect)
      .eq('archived', false)
      .gte('current_streak_days', minStreakDays)
      // last_seen_at must exist AND be recent enough. PostgREST's
      // gte filter implicitly excludes nulls, so the not-null guard
      // is redundant but kept explicit for clarity.
      .not('last_seen_at', 'is', null)
      .gte('last_seen_at', staleCutoffIso)
      .order('current_streak_days', { ascending: false })
      .order('last_seen_at', { ascending: false })
      .limit(limit);

    if (options.teamId) {
      q = q.eq('team_membership.team_id', options.teamId);
    }

    if (gymId) {
      q = q.eq('gym_id', gymId);
    } else {
      q = q.eq('instructor_user_id', instructorUserId);
    }

    const { data, error } = await q;
    if (error) {
      logError(error, { action: 'listActiveStreakers', instructorUserId, gymId });
      return { success: false, error: error.message };
    }

    // Same dynamic-select cast rationale as listAtRiskClients above.
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      current_streak_days: number;
      longest_streak_days: number;
      last_seen_at: string | null;
    }>;

    return { success: true, data: rows };
  } catch (error) {
    logError(error, { action: 'listActiveStreakers', instructorUserId, gymId });
    return { success: false, error: 'Failed to list active streakers' };
  }
}

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
