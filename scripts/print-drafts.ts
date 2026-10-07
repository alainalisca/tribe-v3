/**
 * Dev-only script: prints actual message drafts for real test-gym members.
 * Read-only — no writes. Uses service-role key from .env.local.
 *
 * Usage:
 *   npx tsx --env-file .env.local scripts/print-drafts.ts
 */
import { createClient } from '@supabase/supabase-js';
import { renderDraft, selectCase, type DraftContext } from '../lib/tribe-os/drafts/templates';

const GYM_ID = 'd585af30-5ed5-448b-bd9c-ab82b2e99970';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: clients, error: cErr } = await supabase
    .from('clients')
    .select('id, name, phone, external_id, plan_ends_on')
    .eq('gym_id', GYM_ID);
  if (cErr) throw cErr;

  const { data: scores, error: sErr } = await supabase
    .from('client_retention_v2')
    .select('client_id, score, level, reasons, signals, computed_at')
    .eq('gym_id', GYM_ID);
  if (sErr) throw sErr;

  const scoreMap = new Map((scores ?? []).map((s) => [s.client_id, s]));

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: visits } = await supabase
    .from('client_visits')
    .select('client_id, visited_at, coach_name, class_name')
    .eq('gym_id', GYM_ID)
    .gte('visited_at', thirtyDaysAgo.toISOString())
    .order('visited_at', { ascending: false });

  const visitMap = new Map<string, { visited_at: string; coach_name: string | null; class_name: string | null }>();
  for (const v of visits ?? []) {
    if (!visitMap.has(v.client_id)) {
      visitMap.set(v.client_id, { visited_at: v.visited_at, coach_name: v.coach_name, class_name: v.class_name });
    }
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: touches } = await supabase
    .from('client_touches')
    .select('client_id, created_at')
    .eq('gym_id', GYM_ID)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  const touchMap = new Map<string, string>();
  for (const t of touches ?? []) {
    if (!touchMap.has(t.client_id)) touchMap.set(t.client_id, t.created_at);
  }

  type Row = {
    id: string;
    name: string | null;
    phone: string | null;
    external_id: string | null;
    plan_ends_on: string | null;
    reasons: string[];
    days: number | null;
    lastActivityAt: string | null;
    coachName: string | null;
    className: string | null;
    cameBack: boolean;
    case: string;
  };

  const rows: Row[] = (clients ?? []).map((c) => {
    const s = scoreMap.get(c.id);
    const v = visitMap.get(c.id);
    const days = s?.signals?.days_since_last_activity ?? null;
    let lastActivityAt: string | null = s?.signals?.last_activity_at ?? null;
    if (v && (!lastActivityAt || new Date(v.visited_at) > new Date(lastActivityAt))) {
      lastActivityAt = v.visited_at;
    }
    const level = s?.level;
    const cameBack = !!(lastActivityAt && days !== null && days <= 7 && (level === 'high' || level === 'medium'));
    const reasons: string[] = s?.reasons ?? [];

    const ctx: DraftContext = {
      memberId: c.id,
      memberName: c.name,
      phone: c.phone,
      reasons,
      daysSinceLastActivity: days,
      lastActivityAt,
      lastTouchCreatedAt: touchMap.get(c.id) ?? null,
      cameBack,
      coachName: v?.coach_name ?? null,
      className: v?.class_name ?? null,
      planEndsOn: c.plan_ends_on ?? null,
      language: 'es',
    };

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      external_id: c.external_id,
      plan_ends_on: c.plan_ends_on,
      reasons,
      days,
      lastActivityAt,
      coachName: v?.coach_name ?? null,
      className: v?.class_name ?? null,
      cameBack,
      case: selectCase(ctx),
    };
  });

  // Find target members
  const natalia = rows.find((r) => r.external_id === 'MIRA-0001');
  const planExpired = rows.find((r) => r.case === 'plan_expired' && !r.cameBack);
  const absent = rows.find((r) => r.case === 'absent');
  const visitingLess = rows.find((r) => r.case === 'visiting_less');
  const newNotComing = rows.find((r) => r.case === 'new_not_coming');

  const targets = [
    { label: 'Natalia (MIRA-0001)', row: natalia },
    { label: 'Plan expired (not back)', row: planExpired },
    { label: 'Absent 14+ days', row: absent },
    { label: 'Visiting less', row: visitingLess },
    { label: 'New not coming', row: newNotComing },
  ];

  for (const { label, row } of targets) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${label}`);
    if (!row) {
      console.log('  (no matching member found)');
      continue;
    }
    console.log(`  Name: ${row.name}  |  external_id: ${row.external_id}`);
    console.log(`  Case: ${row.case}  |  Days: ${row.days}  |  cameBack: ${row.cameBack}`);
    console.log(`  Coach: ${row.coachName ?? '(none)'}  |  Class: ${row.className ?? '(none)'}`);
    console.log(`  Plan ends: ${row.plan_ends_on ?? '(null)'}  |  Reasons: ${JSON.stringify(row.reasons)}`);

    const ctx: DraftContext = {
      memberId: row.id,
      memberName: row.name,
      phone: row.phone,
      reasons: row.reasons,
      daysSinceLastActivity: row.days,
      lastActivityAt: row.lastActivityAt,
      lastTouchCreatedAt: touchMap.get(row.id) ?? null,
      cameBack: row.cameBack,
      coachName: row.coachName,
      className: row.className,
      planEndsOn: row.plan_ends_on,
      language: 'es',
    };

    for (const v of [0, 1, 2]) {
      const d = renderDraft(ctx, v);
      console.log(`  [v${v}] (${d.text.length} chars) ${d.text}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
