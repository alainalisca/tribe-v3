/**
 * DAL: client + attendance CSV exports.
 *
 * Extracted from lib/dal/clients.ts during the Phase 2 refactor to
 * keep that file under 1500 lines. The exports here are still
 * re-exported from clients.ts so existing imports continue to work.
 *
 * Companion endpoints to the import flow shipped earlier. Coaches
 * who imported their roster from a spreadsheet will eventually want
 * to export it back (tool migration, tax season, sharing with an
 * accountant). We mirror the revenue export's pattern: load → cap →
 * serialize.
 *
 * Caps at MAX_EXPORT_ROWS to bound memory. Gyms exceeding this can
 * split by date or fall through to a streamed implementation later.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { rowsToCsv } from '@/lib/csv/serialize';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { ClientRow, ClientTenantContext } from './clients';

const MAX_EXPORT_ROWS = 10_000;

/**
 * Same select string as the live clients list, kept literal here so
 * a refactor of one doesn't silently desync the other. If the canonical
 * select string ever moves to a shared constant, replace this in both
 * files at the same time.
 */
const CLIENT_SELECT =
  'id, instructor_user_id, gym_id, name, email, phone, contact_info, notes, tags, status, health_notes, last_seen_at, archived, archived_at, created_at, updated_at, churn_risk_score, churn_risk_updated_at, health_status, total_sessions, sessions_last_30_days, current_streak_days, longest_streak_days';

export interface GenerateClientsCsvOptions {
  /**
   * When true, the export gains a `teams` column listing each
   * client's team memberships (semicolon-separated). This breaks
   * the round-trip property — the importer doesn't currently
   * process team membership — but for owners doing roster audits
   * or a year-end accountant handoff, knowing who belongs to
   * which team is the question they're actually trying to answer.
   * Opt-in so the default export stays round-trippable.
   */
  includeTeams?: boolean;
}

/**
 * Generate a CSV string of every non-archived client in the gym.
 * Columns are intentionally a strict superset of the import format
 * so a coach can round-trip: export → edit → re-import → continue.
 *
 * Excludes archived clients (consistent with the in-app list view).
 * Caller is expected to wrap the result with buildCsvResponse.
 */
export async function generateClientsCsv(
  supabase: SupabaseClient,
  context: ClientTenantContext,
  options: GenerateClientsCsvOptions = {}
): Promise<DalResult<string>> {
  try {
    const gymId = context.gymId;
    const instructorUserId = context.instructorUserId;
    // Dynamic select: pull team membership join when requested. The
    // join returns rows with embedded team name + id; we flatten in
    // TS. We use a LEFT join (no `!inner`) so clients with no team
    // memberships still surface as empty cells.
    const selectString = options.includeTeams
      ? `${CLIENT_SELECT}, team_memberships:gym_team_members(team:gym_teams(id, name))`
      : CLIENT_SELECT;
    let query = supabase
      .from('clients')
      .select(selectString)
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS);
    // Same tenant gating as listClients — prefer gym, fall back to
    // legacy instructor scope. RLS does the heavy lifting but the
    // explicit filter is a defense-in-depth layer.
    if (gymId) query = query.eq('gym_id', gymId);
    else query = query.eq('instructor_user_id', instructorUserId);
    const { data, error } = await query;
    if (error) {
      logError(error, { action: 'generateClientsCsv', gymId, instructorUserId });
      return { success: false, error: error.message };
    }
    // Double-cast to defeat PostgREST's static parser when the
    // dynamic select adds the team_memberships join — same pattern
    // used by listAtRiskClients / listActiveStreakers.
    const rows = (data ?? []) as unknown as Array<
      ClientRow & {
        team_memberships?: Array<{ team: { id: string; name: string } | null }>;
      }
    >;
    // Columns named to match the import parser's HEADER_ALIASES so a
    // coach can edit + re-import without renaming anything. The
    // optional `teams` column is appended at the end so consumers
    // who don't care about it can ignore the last column without
    // affecting earlier-column reads.
    const header = [
      'name',
      'email',
      'phone',
      'status',
      'tags',
      'notes',
      'health_notes',
      'last_seen_at',
      'total_sessions',
      'sessions_last_30_days',
      'current_streak_days',
      'longest_streak_days',
      'health_status',
      'churn_risk_score',
      'created_at',
    ];
    if (options.includeTeams) header.push('teams');
    const body = rows.map((r) => {
      const base = [
        r.name ?? '',
        r.email ?? '',
        r.phone ?? '',
        r.status ?? '',
        r.tags?.join('; ') ?? '',
        r.notes ?? '',
        r.health_notes ?? '',
        r.last_seen_at ?? '',
        String(r.total_sessions ?? 0),
        String(r.sessions_last_30_days ?? 0),
        String(r.current_streak_days ?? 0),
        String(r.longest_streak_days ?? 0),
        r.health_status ?? '',
        r.churn_risk_score != null ? r.churn_risk_score.toFixed(3) : '',
        r.created_at ?? '',
      ];
      if (options.includeTeams) {
        const teamNames = (r.team_memberships ?? [])
          .map((tm) => tm.team?.name)
          .filter((n): n is string => !!n)
          .join('; ');
        base.push(teamNames);
      }
      return base;
    });
    return { success: true, data: rowsToCsv([header, ...body]) };
  } catch (error) {
    logError(error, { action: 'generateClientsCsv.exception' });
    return { success: false, error: 'Failed to generate clients CSV' };
  }
}

/**
 * Generate a CSV string of every attendance row in the gym, with
 * client name + session display fields joined inline. Optional date
 * range filters (`from` / `to` are ISO timestamps applied to
 * attended_at).
 *
 * Used by accountants / coaches who want to reconcile attendance
 * against revenue records for a tax year. Capped at MAX_EXPORT_ROWS.
 */
export async function generateAttendanceCsv(
  supabase: SupabaseClient,
  context: ClientTenantContext,
  options: { fromIso?: string; toIso?: string } = {}
): Promise<DalResult<string>> {
  try {
    const gymId = context.gymId;
    const instructorUserId = context.instructorUserId;
    // The join goes through clients (for the gym scope) + sessions
    // (for display columns). RLS on client_attendance scopes to the
    // caller's tenant; we additionally filter at the query layer
    // since attendance rows themselves don't carry a gym_id column.
    let query = supabase
      .from('client_attendance')
      .select(
        `
          id, client_id, session_id, attended, paid, attended_at,
          amount_paid_cents, currency, payment_method, notes, created_at,
          client:clients(id, name, email, phone, gym_id, instructor_user_id),
          session:sessions(id, title, sport, date, start_time)
        `
      )
      .order('attended_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(MAX_EXPORT_ROWS);

    if (options.fromIso) query = query.gte('attended_at', options.fromIso);
    if (options.toIso) query = query.lte('attended_at', options.toIso);

    const { data, error } = await query;
    if (error) {
      logError(error, { action: 'generateAttendanceCsv', gymId, instructorUserId });
      return { success: false, error: error.message };
    }

    // Filter to the caller's gym/instructor at the JS layer. RLS
    // already handles this, but the explicit filter prevents stray
    // rows from misconfigured policies leaking into the file.
    const rows = (data ?? []).filter((r) => {
      const client = r.client as unknown as { gym_id: string | null; instructor_user_id: string } | null;
      if (!client) return false;
      if (gymId) return client.gym_id === gymId;
      return client.instructor_user_id === instructorUserId;
    });

    const header = [
      'attended_at',
      'client_name',
      'client_email',
      'client_phone',
      'session_title',
      'session_sport',
      'session_date',
      'session_start_time',
      'attended',
      'paid',
      'amount_paid',
      'currency',
      'payment_method',
      'notes',
      'created_at',
    ];

    const body = rows.map((r) => {
      const client = r.client as unknown as { name: string | null; email: string | null; phone: string | null } | null;
      const session = r.session as unknown as {
        title: string | null;
        sport: string | null;
        date: string | null;
        start_time: string | null;
      } | null;
      // amount_paid_cents → decimal string for the spreadsheet.
      // 12345 → "123.45". Leaves "" for missing values so the column
      // type stays numeric in Excel auto-detect.
      const amount = r.amount_paid_cents != null ? (r.amount_paid_cents / 100).toFixed(2) : '';
      return [
        r.attended_at ?? '',
        client?.name ?? '',
        client?.email ?? '',
        client?.phone ?? '',
        session?.title ?? '',
        session?.sport ?? '',
        session?.date ?? '',
        session?.start_time ?? '',
        r.attended ? 'true' : 'false',
        r.paid ? 'true' : 'false',
        amount,
        r.currency ?? '',
        r.payment_method ?? '',
        r.notes ?? '',
        r.created_at ?? '',
      ];
    });

    return { success: true, data: rowsToCsv([header, ...body]) };
  } catch (error) {
    logError(error, { action: 'generateAttendanceCsv.exception' });
    return { success: false, error: 'Failed to generate attendance CSV' };
  }
}
