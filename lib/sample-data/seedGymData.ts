/**
 * lib/sample-data/seedGymData.ts
 *
 * Dev-only seeder: creates 10 realistic sample clients + 7 sessions
 * + ~50 attendance rows scoped to a single gym, so the user can
 * actually demo Tribe.OS without manually entering 50 attendance
 * rows themselves.
 *
 * Designed to exercise every insight type the engine emits:
 *   - CHURN_RISK         — clients with declining attendance
 *   - RETENTION_OPP      — healthy/at-risk training-partner pairs
 *   - REVENUE            — attended-but-unpaid runs
 *   - GROWTH             — recurring sessions hitting near 100% fill
 *
 * Safety:
 *   1. Caller is responsible for env gating (ALLOW_SAMPLE_DATA_SEED).
 *   2. We refuse if the gym already has any non-archived clients —
 *      blast-radius is "test gym setup" only, never "mix with real
 *      production data."
 *   3. Every seeded client carries a `sample-data` tag + an email at
 *      `sample.tribe.local` so the user can identify + delete them
 *      later via a simple SQL filter.
 *
 * Side effects (via existing DB triggers, not us):
 *   - The attendance trigger from migration 079 recomputes
 *     total_sessions / sessions_last_30_days / current_streak_days /
 *     longest_streak_days for every inserted client.
 *   - The training-partner trigger from migration 076 writes
 *     training_partners edges for every co-attended session.
 *
 * After running the seed, the user clicks "Run intelligence engine"
 * on /os/intelligence to score everyone and emit insights. All four
 * insight types should fire on this dataset.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';

export interface SeedSummary {
  /** Number of sample client rows inserted. */
  clients_created: number;
  /** Number of sample session rows inserted. */
  sessions_created: number;
  /** Number of client_attendance rows inserted. */
  attendance_created: number;
  /** Reason the seed skipped, if it didn't run. */
  skipped_reason?: 'existing_clients' | 'service_role_missing' | 'gym_owner_missing';
}

export interface CleanupSummary {
  /** Number of sample clients deleted (cascades to attendance + partners). */
  clients_deleted: number;
  /** Number of sample sessions deleted. */
  sessions_deleted: number;
  /** Number of community_insights rows deleted (the ones referencing sample clients). */
  insights_deleted: number;
  skipped_reason?: 'service_role_missing';
}

const SAMPLE_TAG = 'sample-data';
const SAMPLE_EMAIL_DOMAIN = 'sample.tribe.local';

function buildServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createServiceClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Day delta from today (UTC). Returns a Date at midnight UTC for the
 * given offset. Used as the `date` column on sessions (which is a
 * DATE, not a timestamptz).
 */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Specific timestamp at noon UTC for a given days-ago offset. Used
 * for attended_at — having attendance at noon avoids ambiguity at
 * day boundaries when we compute "in the last N days" windows.
 */
function attendedAtIso(daysAgoN: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgoN);
  return d.toISOString();
}

// --------------------------------------------------------------------
// Sample client roster
// --------------------------------------------------------------------
//
// Each entry includes a behavior key that drives which attendance
// rows we generate — that's how we hand-shape the patterns each
// insight type needs.

type Behavior =
  | 'healthy_consistent' // High frequency, paid, daily-ish
  | 'healthy_streak' // Active streak through today
  | 'at_risk_lapsed' // High frequency 30+ days ago, nothing recent
  | 'at_risk_sporadic' // One attendance 20+ days ago, otherwise blank
  | 'healthy_unpaid' // Active but several attended-not-paid → REVENUE
  | 'lead_no_activity'; // Lead status, no attendance recorded

interface SampleClientSpec {
  name: string;
  /** Used to derive an email like `ana.garcia@sample.tribe.local`. */
  slug: string;
  phone: string;
  status: 'active' | 'lapsed' | 'lead';
  behavior: Behavior;
}

const SAMPLE_CLIENTS: SampleClientSpec[] = [
  // — Healthy core (consistent attenders)
  { name: 'Ana García', slug: 'ana.garcia', phone: '+573001110001', status: 'active', behavior: 'healthy_consistent' },
  {
    name: 'María Rodríguez',
    slug: 'maria.rodriguez',
    phone: '+573001110002',
    status: 'active',
    behavior: 'healthy_consistent',
  },
  {
    name: 'Andrés Vargas',
    slug: 'andres.vargas',
    phone: '+573001110003',
    status: 'active',
    behavior: 'healthy_consistent',
  },
  { name: 'Camila Ortiz', slug: 'camila.ortiz', phone: '+573001110004', status: 'active', behavior: 'healthy_streak' },
  // — At-risk patterns (drive CHURN_RISK + RETENTION_OPP)
  { name: 'Carlos López', slug: 'carlos.lopez', phone: '+573001110005', status: 'active', behavior: 'at_risk_lapsed' },
  {
    name: 'Sebastián Ramírez',
    slug: 'sebastian.ramirez',
    phone: '+573001110006',
    status: 'active',
    behavior: 'at_risk_sporadic',
  },
  {
    name: 'Luisa Martínez',
    slug: 'luisa.martinez',
    phone: '+573001110007',
    status: 'active',
    behavior: 'at_risk_sporadic',
  },
  // — Unpaid attendance (drive REVENUE)
  {
    name: 'Diego Hernández',
    slug: 'diego.hernandez',
    phone: '+573001110008',
    status: 'active',
    behavior: 'healthy_unpaid',
  },
  { name: 'Mateo Castro', slug: 'mateo.castro', phone: '+573001110009', status: 'active', behavior: 'healthy_unpaid' },
  // — Lead with no activity (won't show up in scoring)
  {
    name: 'Isabella Torres',
    slug: 'isabella.torres',
    phone: '+573001110010',
    status: 'lead',
    behavior: 'lead_no_activity',
  },
];

// --------------------------------------------------------------------
// Sample session series
// --------------------------------------------------------------------
//
// Three series across four weekly instances each. The Tuesday CrossFit
// series is deliberately near-100% fill so the GROWTH heuristic
// (3 of last 4 ≥ 90%) fires. The other two have lower fill so we
// don't blanket every series with a growth card.

interface SampleSessionSpec {
  title: string;
  sport: string;
  /** Day of week label, for human reading only. */
  dow: string;
  /** Start time as "HH:MM" — paired with `daysAgo` to produce concrete sessions. */
  startTime: string;
  durationMinutes: number;
  /** Maximum capacity (drives the GROWTH fill-rate ratio). */
  maxParticipants: number;
  /** Days-ago offsets for the 4 most-recent instances of this series. */
  instances: number[];
}

const SESSION_SERIES: SampleSessionSpec[] = [
  // Hot recurring class — 100% fill 3 of last 4 weeks → GROWTH insight
  {
    title: 'CrossFit',
    sport: 'CrossFit',
    dow: 'Tue',
    startTime: '17:00',
    durationMinutes: 60,
    maxParticipants: 8,
    instances: [2, 9, 16, 23],
  },
  // Mid fill — no growth flag
  {
    title: 'Morning Run',
    sport: 'Running',
    dow: 'Thu',
    startTime: '06:00',
    durationMinutes: 45,
    maxParticipants: 15,
    instances: [4, 11, 18, 25],
  },
  // Low fill
  {
    title: 'Yoga Flow',
    sport: 'Yoga',
    dow: 'Sat',
    startTime: '08:00',
    durationMinutes: 60,
    maxParticipants: 12,
    instances: [6, 13, 20, 27],
  },
];

// --------------------------------------------------------------------
// Attendance distribution rules
// --------------------------------------------------------------------
//
// Maps each (behavior, session-series, days-ago) tuple to whether the
// client attended + whether they paid. Hand-shaped — random would
// produce inconsistent insights across runs.

interface AttendancePlan {
  attended: boolean;
  paid: boolean;
  amount_paid_cents?: number;
}

function planAttendance(behavior: Behavior, daysAgoN: number, isCrossfit: boolean): AttendancePlan | null {
  switch (behavior) {
    case 'lead_no_activity':
      return null;
    case 'healthy_consistent':
      // Attend most sessions, pay for them. Skip the oldest instance
      // here and there so it's not perfectly uniform.
      if (daysAgoN > 21 && !isCrossfit) return null;
      return { attended: true, paid: true, amount_paid_cents: 30000 }; // 30000 COP = ~$8
    case 'healthy_streak':
      // Same as consistent, plus an attendance today so the streak
      // counter from migration 079 picks up a current_streak_days > 0.
      if (daysAgoN === 0) return { attended: true, paid: true, amount_paid_cents: 30000 };
      if (daysAgoN > 21) return null;
      return { attended: true, paid: true, amount_paid_cents: 30000 };
    case 'at_risk_lapsed':
      // High frequency 30-90d ago is hard to backfill (we only seed
      // last 28 days). Instead we encode "active 30d ago, gone now":
      // attended the 2 oldest instances, nothing recent. The scorer
      // catches the "days since last attendance" signal.
      if (daysAgoN >= 16) return { attended: true, paid: true, amount_paid_cents: 30000 };
      return null;
    case 'at_risk_sporadic':
      // Attended one session, not recently. Looks like a one-off
      // trial that never returned.
      if (daysAgoN === 23 && isCrossfit) return { attended: true, paid: true, amount_paid_cents: 30000 };
      return null;
    case 'healthy_unpaid':
      // Showed up to many sessions, didn't pay for most. The REVENUE
      // generator requires ≥3 attended-not-paid rows in last 30 days.
      if (daysAgoN > 21) return null;
      // Pay for the first one; everything else attended-not-paid.
      if (daysAgoN === 2 && isCrossfit) return { attended: true, paid: true, amount_paid_cents: 30000 };
      return { attended: true, paid: false };
  }
}

// --------------------------------------------------------------------
// Main seed entry point
// --------------------------------------------------------------------

export async function seedGymData(gymId: string, ownerUserId: string): Promise<SeedSummary> {
  const service = buildServiceClient();
  if (!service) {
    return { clients_created: 0, sessions_created: 0, attendance_created: 0, skipped_reason: 'service_role_missing' };
  }

  // Safety net: refuse to seed when the gym already has non-archived
  // clients. Prevents mixing sample data into a real roster.
  const { count: existing, error: existingErr } = await service
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('gym_id', gymId)
    .eq('archived', false);
  if (existingErr) {
    logError(existingErr, { action: 'seedGymData.count', gymId });
    return { clients_created: 0, sessions_created: 0, attendance_created: 0 };
  }
  if ((existing ?? 0) > 0) {
    return {
      clients_created: 0,
      sessions_created: 0,
      attendance_created: 0,
      skipped_reason: 'existing_clients',
    };
  }

  // 1. Insert sample clients in one bulk call.
  const clientRows = SAMPLE_CLIENTS.map((c) => ({
    instructor_user_id: ownerUserId,
    gym_id: gymId,
    name: c.name,
    email: `${c.slug}@${SAMPLE_EMAIL_DOMAIN}`,
    phone: c.phone,
    tags: [SAMPLE_TAG],
    status: c.status,
  }));
  const { data: insertedClients, error: clientsErr } = await service
    .from('clients')
    .insert(clientRows)
    .select('id, email');
  if (clientsErr || !insertedClients) {
    logError(clientsErr ?? new Error('no client rows'), { action: 'seedGymData.clients', gymId });
    return { clients_created: 0, sessions_created: 0, attendance_created: 0 };
  }

  // Build a slug → client_id map so we can match attendance to the
  // right client without depending on insertion order.
  const slugToId = new Map<string, string>();
  for (const row of insertedClients) {
    const email = row.email as string;
    const slug = email.split('@')[0];
    slugToId.set(slug, row.id as string);
  }

  // 2. Flatten the session series into concrete session rows. Each
  //    instance becomes one row with a recognizable label.
  interface SessionInsertRow {
    creator_id: string;
    sport: string;
    title: string;
    description: string;
    date: string;
    start_time: string;
    duration: number;
    location: string;
    max_participants: number;
    current_participants: number;
  }
  const sessionInserts: SessionInsertRow[] = [];
  const sessionMeta: Array<{ series: SampleSessionSpec; daysAgoN: number }> = [];

  for (const series of SESSION_SERIES) {
    for (const daysAgoN of series.instances) {
      const d = daysAgo(daysAgoN);
      sessionInserts.push({
        creator_id: ownerUserId,
        sport: series.sport,
        title: series.title,
        description: 'Sample data — generated for demo purposes.',
        date: isoDateOnly(d),
        start_time: series.startTime,
        duration: series.durationMinutes,
        location: 'Studio (sample)',
        max_participants: series.maxParticipants,
        // GROWTH wants current >= 90% of max. Tuesday CrossFit is
        // sized so the actual attended count from healthy clients
        // (6-ish) is well over 90% of max (8). The other series
        // stay under threshold.
        current_participants:
          series.title === 'CrossFit' ? series.maxParticipants : Math.floor(series.maxParticipants * 0.5),
      });
      sessionMeta.push({ series, daysAgoN });
    }
  }

  const { data: insertedSessions, error: sessionsErr } = await service
    .from('sessions')
    .insert(sessionInserts)
    .select('id');
  if (sessionsErr || !insertedSessions) {
    logError(sessionsErr ?? new Error('no session rows'), { action: 'seedGymData.sessions', gymId });
    return {
      clients_created: insertedClients.length,
      sessions_created: 0,
      attendance_created: 0,
    };
  }

  // 3. Build attendance rows. For each (session, client) pair, the
  //    planAttendance function decides whether to insert a row.
  //    Inserting fires both triggers (079 counters + 076 partners)
  //    so the gym dataset becomes consistent automatically.
  interface AttendanceInsertRow {
    client_id: string;
    session_id: string;
    attended: boolean;
    paid: boolean;
    attended_at: string;
    amount_paid_cents: number | null;
    currency: string | null;
  }
  const attendanceInserts: AttendanceInsertRow[] = [];

  for (let i = 0; i < insertedSessions.length; i += 1) {
    const session = insertedSessions[i];
    const meta = sessionMeta[i];
    const isCrossfit = meta.series.title === 'CrossFit';

    for (const spec of SAMPLE_CLIENTS) {
      const clientId = slugToId.get(spec.slug);
      if (!clientId) continue;
      const plan = planAttendance(spec.behavior, meta.daysAgoN, isCrossfit);
      if (!plan) continue;
      attendanceInserts.push({
        client_id: clientId,
        session_id: session.id as string,
        attended: plan.attended,
        paid: plan.paid,
        attended_at: attendedAtIso(meta.daysAgoN),
        amount_paid_cents: plan.paid ? (plan.amount_paid_cents ?? null) : null,
        currency: plan.paid ? 'COP' : null,
      });
    }
  }

  // Insert attendance in one batch. The counter + partner triggers
  // will fire row-by-row (per the AFTER INSERT semantics) so by the
  // time this returns, every client's cached counters are correct
  // and training_partners has the expected edge set.
  if (attendanceInserts.length > 0) {
    const { error: attendanceErr } = await service.from('client_attendance').insert(attendanceInserts);
    if (attendanceErr) {
      logError(attendanceErr, { action: 'seedGymData.attendance', gymId });
      return {
        clients_created: insertedClients.length,
        sessions_created: insertedSessions.length,
        attendance_created: 0,
      };
    }
  }

  log('info', 'seedGymData.done', {
    action: 'seedGymData',
    gymId,
    clients_created: insertedClients.length,
    sessions_created: insertedSessions.length,
    attendance_created: attendanceInserts.length,
  });

  return {
    clients_created: insertedClients.length,
    sessions_created: insertedSessions.length,
    attendance_created: attendanceInserts.length,
  };
}

/**
 * Remove every sample-data row for a gym. Mirror of seedGymData —
 * targets only rows the seeder created (identified by the
 * `sample-data` tag on clients + the marker description on sessions)
 * so we never collateral-damage real data even if the user manages
 * to mix the two.
 *
 * Order matters:
 *   1. Delete community_insights tied to sample-data clients (community_insight_members has ON DELETE CASCADE from clients, but the insight rows themselves don't reference clients directly — they reference gym_id. We filter to insights whose linked members are all sample-data).
 *   2. Delete the sample clients — cascades client_attendance + training_partners + community_insight_members via ON DELETE.
 *   3. Delete sample sessions — they're the seed's marker description.
 */
export async function cleanupGymSampleData(gymId: string): Promise<CleanupSummary> {
  const service = buildServiceClient();
  if (!service) {
    return { clients_deleted: 0, sessions_deleted: 0, insights_deleted: 0, skipped_reason: 'service_role_missing' };
  }

  // 1. Find every sample-data client id in this gym. We need the ids
  //    to scope the insight delete + to count what we removed.
  const { data: sampleClients, error: clientsErr } = await service
    .from('clients')
    .select('id')
    .eq('gym_id', gymId)
    .contains('tags', [SAMPLE_TAG]);
  if (clientsErr) {
    logError(clientsErr, { action: 'cleanupGymSampleData.list_clients', gymId });
    return { clients_deleted: 0, sessions_deleted: 0, insights_deleted: 0 };
  }
  const sampleClientIds = (sampleClients ?? []).map((r) => r.id as string);

  // 2. Delete insights whose linked members are entirely sample-data.
  //    For insights with no linked members (e.g. GROWTH cards which
  //    are gym-level), match by data_payload-shape heuristic isn't
  //    safe — better to leave gym-level insights alone here and let
  //    the user dismiss them via the UI. So we ONLY drop insights
  //    that reference at least one sample client.
  let insightsDeleted = 0;
  if (sampleClientIds.length > 0) {
    const { data: insightLinks, error: linkErr } = await service
      .from('community_insight_members')
      .select('insight_id, client_id')
      .in('client_id', sampleClientIds);
    if (linkErr) {
      logError(linkErr, { action: 'cleanupGymSampleData.find_insights', gymId });
    } else {
      // Group links by insight_id. If every linked client is a sample
      // client, the insight is "purely sample" and safe to drop.
      // (In practice the seeder doesn't share insights across real +
      // sample members, but the check is cheap.)
      const insightToClients = new Map<string, Set<string>>();
      for (const row of insightLinks ?? []) {
        const set = insightToClients.get(row.insight_id as string) ?? new Set();
        set.add(row.client_id as string);
        insightToClients.set(row.insight_id as string, set);
      }
      const sampleSet = new Set(sampleClientIds);
      const dropIds: string[] = [];
      for (const [insightId, linkedClients] of insightToClients) {
        const everyLinkedIsSample = Array.from(linkedClients).every((c) => sampleSet.has(c));
        if (everyLinkedIsSample) dropIds.push(insightId);
      }
      if (dropIds.length > 0) {
        const { error: deleteErr, count } = await service
          .from('community_insights')
          .delete({ count: 'exact' })
          .in('id', dropIds);
        if (deleteErr) {
          logError(deleteErr, { action: 'cleanupGymSampleData.delete_insights', gymId });
        } else {
          insightsDeleted = count ?? dropIds.length;
        }
      }
    }
  }

  // 3. Delete sample clients. Cascades to client_attendance,
  //    training_partners, community_insight_members.
  let clientsDeleted = 0;
  if (sampleClientIds.length > 0) {
    const { error: deleteErr, count } = await service
      .from('clients')
      .delete({ count: 'exact' })
      .in('id', sampleClientIds);
    if (deleteErr) {
      logError(deleteErr, { action: 'cleanupGymSampleData.delete_clients', gymId });
    } else {
      clientsDeleted = count ?? sampleClientIds.length;
    }
  }

  // 4. Delete sample sessions. They're scoped by description marker;
  //    we further filter to those created by the gym owner so a real
  //    session that happens to have the same description (extremely
  //    unlikely) doesn't get caught.
  const { data: gymOwner } = await service.from('gyms').select('owner_user_id').eq('id', gymId).maybeSingle();
  let sessionsDeleted = 0;
  if (gymOwner?.owner_user_id) {
    const { error: sessionDeleteErr, count } = await service
      .from('sessions')
      .delete({ count: 'exact' })
      .eq('creator_id', gymOwner.owner_user_id)
      .eq('description', 'Sample data — generated for demo purposes.');
    if (sessionDeleteErr) {
      logError(sessionDeleteErr, { action: 'cleanupGymSampleData.delete_sessions', gymId });
    } else {
      sessionsDeleted = count ?? 0;
    }
  }

  log('info', 'cleanupGymSampleData.done', {
    action: 'cleanupGymSampleData',
    gymId,
    clients_deleted: clientsDeleted,
    sessions_deleted: sessionsDeleted,
    insights_deleted: insightsDeleted,
  });

  return {
    clients_deleted: clientsDeleted,
    sessions_deleted: sessionsDeleted,
    insights_deleted: insightsDeleted,
  };
}
