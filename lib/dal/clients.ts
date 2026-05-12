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
import type { DalResult } from './types';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type Currency = 'USD' | 'COP';
export type PaymentMethod = 'cash' | 'transfer' | 'stripe' | 'other';

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
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
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
}

export interface UpdateClientInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  tags?: string[];
  contact_info?: Record<string, unknown> | null;
  archived?: boolean;
}

export type RecordAttendanceInput = {
  client_id: string;
  session_id: string;
  attended: boolean;
  paid: boolean;
  attended_at?: string | null;
  notes?: string | null;
} & PaymentFields;

export interface ListClientsFilters {
  searchQuery?: string;
  tag?: string;
}

const CLIENT_SELECT =
  'id, instructor_user_id, gym_id, name, email, phone, contact_info, notes, tags, archived, archived_at, created_at, updated_at';

const ATTENDANCE_SELECT =
  'id, client_id, session_id, attended, paid, attended_at, amount_paid_cents, currency, payment_method, notes, created_at, updated_at';

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

    enriched.sort((a, b) => {
      // Most recent attendance first, NULLS last.
      if (a.last_attendance_at && b.last_attendance_at) {
        return b.last_attendance_at.localeCompare(a.last_attendance_at);
      }
      if (a.last_attendance_at) return -1;
      if (b.last_attendance_at) return 1;
      // Tie-break by created_at desc.
      return b.created_at.localeCompare(a.created_at);
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
