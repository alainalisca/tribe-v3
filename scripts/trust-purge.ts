/* eslint-disable no-console -- a CLI whose output is the report */
/**
 * T-JOIN1 Part C. Takes Tribe's test accounts out of public view, as Al
 * decided after Step 0 and revised on 2026-10-18:
 *
 *   npx tsx scripts/trust-purge.ts           # dry run: prints what it would do, writes nothing
 *   npx tsx scripts/trust-purge.ts --apply   # ONLY with Al's go
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
 * environment or .env.local.
 *
 *   delete  the user "Demo": deleted_at (he hosts nothing and has no
 *           bookings or payments; measured 2026-10-18). Already soft-deleted
 *           on 2026-10-10, so this reports "already done" and keeps that date.
 *           The community "PRUEBA TZ - borrar": deleted_at = now(), the app's
 *           own delete (lib/dal/communities.ts reads deleted_at IS NULL).
 *           Nothing is hard-deleted; the row stays for the record.
 *   hide    the partner "TEST Tribe pass (not a real gym)": status 'expired'
 *           (public partner lists read status 'active' only).
 *           The Tribe.OS gym "BullBox (Prueba)": deleted_at = now() and
 *           intelligence_email_enabled = false, so it stops sending the digest
 *           and the weekly summary (those senders read the toggle, not
 *           deleted_at). Its owner no longer sees it in Tribe.OS either.
 *   keep    everyone already flagged stays flagged; the script lists them and
 *           changes none of them.
 *
 * NEVER_FLAG: real people whose names look like test accounts (Claude
 * Marc-Charles is Al's uncle). No target may name them, and the review list
 * of test-looking names leaves them out, so a pattern never catches them again.
 *
 * Every target is pinned by id AND name: a row whose name no longer matches is
 * reported and skipped, never changed. A target already in the wanted state is
 * reported as such. Each change prints the SQL that would undo it.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Target =
  | { kind: 'flag-user'; table: 'users'; id: string; name: string }
  | { kind: 'delete-user'; table: 'users'; id: string; name: string }
  | { kind: 'delete-community'; table: 'communities'; id: string; name: string }
  | { kind: 'hide-partner'; table: 'featured_partners'; id: string; name: string }
  | { kind: 'hide-gym'; table: 'gyms'; id: string; name: string };

/** Ids measured 2026-10-18 (Step 0, read only). */
export const TARGETS: Target[] = [
  { kind: 'delete-user', table: 'users', id: 'ba093e35-b341-4729-a145-52358eefe0da', name: 'Demo' },
  {
    kind: 'delete-community',
    table: 'communities',
    id: '9e283783-10ad-407b-8f90-75aa50bb5217',
    name: 'PRUEBA TZ - borrar',
  },
  {
    kind: 'hide-partner',
    table: 'featured_partners',
    id: 'c7d38815-75e5-4614-84ec-8d531df6e300',
    name: 'TEST Tribe pass (not a real gym)',
  },
  { kind: 'hide-gym', table: 'gyms', id: 'd585af30-5ed5-448b-bd9c-ab82b2e99970', name: 'BullBox (Prueba)' },
];

/** Real users. Never a target, never on the review list (Al, 2026-10-18). */
export const NEVER_FLAG: { id: string; name: string; why: string }[] = [
  { id: '15bae2c6-cf33-4566-ab8a-df5d455cc578', name: 'Claude Marc-Charles', why: "a real user, Al's uncle" },
];

/** The Step 0 pattern for test-looking names. Only ever a list for Al to review. */
export const TEST_NAME_PATTERN = /prueba|test|borrar|claude|demo/i;

/**
 * Users whose name looks like a test account and who are not yet flagged,
 * deleted, a target, or on NEVER_FLAG: a list for review, never changed.
 */
export function reviewCandidates(
  users: { id: string; name: string | null; is_test_account: boolean | null; deleted_at: string | null }[]
) {
  const skip = new Set([...NEVER_FLAG.map((u) => u.id), ...TARGETS.map((t) => t.id)]);
  return users.filter(
    (u) => !skip.has(u.id) && !u.is_test_account && !u.deleted_at && TEST_NAME_PATTERN.test(u.name ?? '')
  );
}

const NAME_COLUMN: Record<Target['table'], string> = {
  users: 'name',
  communities: 'name',
  featured_partners: 'business_name',
  gyms: 'name',
};
const STATE_COLUMNS: Record<Target['table'], string> = {
  users: 'is_test_account, deleted_at',
  communities: 'deleted_at, member_count',
  featured_partners: 'status, pass_active',
  gyms: 'deleted_at, intelligence_email_enabled, tribe_os_status',
};

export type Step = {
  target: Target;
  /** What the row holds now (null when there is no such row). */
  current: Record<string, unknown> | null;
  /** The update --apply sends; null when nothing is to change. */
  update: Record<string, unknown> | null;
  /** One line for the report. */
  line: string;
  /** SQL that puts the row back as it was. */
  undo: string | null;
};

const sqlValue = (v: unknown) =>
  v === null || v === undefined ? 'NULL' : typeof v === 'string' ? `'${v}'` : String(v);

/** What would happen to one target, given the row as it is. Pure, for the test. */
export function planStep(target: Target, row: Record<string, unknown> | null, now: string): Step {
  const label = `${target.kind.padEnd(16)} ${target.table}.${target.id.slice(0, 8)} "${target.name}"`;
  if (!row) return { target, current: null, update: null, line: `${label}: NOT FOUND, skipped`, undo: null };
  const actual = String(row[NAME_COLUMN[target.table]] ?? '').trim();
  if (actual !== target.name) {
    return { target, current: row, update: null, line: `${label}: NAME IS NOW "${actual}", skipped`, undo: null };
  }

  let update: Record<string, unknown> = {};
  if (target.kind === 'flag-user') update = { is_test_account: true };
  if (target.kind === 'delete-user') update = { deleted_at: row.deleted_at ?? now };
  if (target.kind === 'delete-community') update = { deleted_at: row.deleted_at ?? now };
  if (target.kind === 'hide-partner') update = { status: 'expired', pass_active: false };
  if (target.kind === 'hide-gym') update = { deleted_at: row.deleted_at ?? now, intelligence_email_enabled: false };

  const changes = Object.entries(update).filter(([k, v]) => row[k] !== v);
  if (changes.length === 0) return { target, current: row, update: null, line: `${label}: already done`, undo: null };

  const diff = changes.map(([k, v]) => `${k} ${sqlValue(row[k])} -> ${sqlValue(v)}`).join(', ');
  const undo = `UPDATE public.${target.table} SET ${changes.map(([k]) => `${k} = ${sqlValue(row[k])}`).join(', ')} WHERE id = '${target.id}';`;
  return { target, current: row, update: Object.fromEntries(changes), line: `${label}: ${diff}`, undo };
}

function env(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  const file = path.resolve(__dirname, '..', '.env.local');
  if (existsSync(file)) {
    const line = readFileSync(file, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith(`${name}=`));
    if (line)
      return line
        .slice(line.indexOf('=') + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
  }
  throw new Error(`${name} is not set`);
}

export async function buildPlan(supabase: SupabaseClient, now: string): Promise<Step[]> {
  const protectedIds = new Set(NEVER_FLAG.map((u) => u.id));
  const bad = TARGETS.filter((t) => protectedIds.has(t.id));
  if (bad.length) throw new Error(`refusing: ${bad.map((t) => t.name).join(', ')} is on NEVER_FLAG`);
  const steps: Step[] = [];
  for (const t of TARGETS) {
    const { data, error } = await supabase
      .from(t.table)
      .select(`id, ${NAME_COLUMN[t.table]}, ${STATE_COLUMNS[t.table]}`)
      .eq('id', t.id)
      .maybeSingle();
    if (error) throw new Error(`${t.table}.${t.id.slice(0, 8)}: ${error.message}`);
    steps.push(planStep(t, (data as Record<string, unknown> | null) ?? null, now));
  }
  return steps;
}

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply');
  const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
  const now = new Date().toISOString();
  const steps = await buildPlan(supabase, now);

  console.log(apply ? 'APPLY\n' : 'DRY RUN: nothing is written\n');
  for (const s of steps) console.log(`${apply && s.update ? 'changes' : 'would  '} ${s.line}`);

  const { data: kept, error } = await supabase
    .from('users')
    .select('id, name, deleted_at')
    .eq('is_test_account', true)
    .order('name');
  if (error) throw new Error(`already flagged: ${error.message}`);
  const flaggedNow = new Set(steps.filter((s) => s.target.kind === 'flag-user').map((s) => s.target.id));
  const keep = (kept ?? []).filter((u) => !flaggedNow.has(u.id));
  console.log(`\nkeep: ${keep.length} users already flagged, unchanged`);
  for (const u of keep) console.log(`   ${u.id.slice(0, 8)} ${u.name}${u.deleted_at ? ' (deleted)' : ''}`);

  const { data: everyone, error: allErr } = await supabase
    .from('users')
    .select('id, name, is_test_account, deleted_at')
    .limit(10000);
  if (allErr) throw new Error(`review list: ${allErr.message}`);
  const review = reviewCandidates((everyone ?? []) as Parameters<typeof reviewCandidates>[0]);
  console.log(`\nnever flag: ${NEVER_FLAG.map((u) => `${u.id.slice(0, 8)} ${u.name} (${u.why})`).join('; ')}`);
  console.log(`review (test-looking names, not in the plan, nothing done): ${review.length ? '' : 'none'}`);
  for (const u of review) console.log(`   ${u.id.slice(0, 8)} ${u.name}`);

  const undo = steps.map((s) => s.undo).filter(Boolean);
  if (undo.length) console.log(`\nundo (run in the SQL editor to put every row back):\n${undo.join('\n')}`);

  if (!apply) return;
  for (const s of steps) {
    if (!s.update) continue;
    const { error: upd } = await supabase.from(s.target.table).update(s.update).eq('id', s.target.id);
    if (upd) throw new Error(`${s.target.name}: update failed: ${upd.message}`);
    console.log(`applied: ${s.target.name}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
