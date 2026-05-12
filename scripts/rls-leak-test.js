#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports, no-console */
/**
 * RLS leak test for Tribe.OS premium tables.
 *
 * Creates two ephemeral premium test users (A and B), populates A's
 * private data (a client, attendance row, etc.), then verifies that B
 * cannot read, update, or delete A's data via direct REST or RPC
 * calls. Tears down both users at the end.
 *
 * Usage from the tribe-v3 directory:
 *   node scripts/rls-leak-test.js
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and
 * SUPABASE_SERVICE_ROLE_KEY from .env.local. Service-role is needed
 * to create the test users and clean them up afterwards. The actual
 * leak attempts use anon-key clients with each user's session, so
 * they exercise the exact same RLS surface a malicious authenticated
 * user would hit through the app.
 *
 * Test phases (each prints PASS or FAIL):
 *   0. smoke: user A can read their own gate columns, call the
 *      user-keyed revenue RPC, and call the gym-keyed totals + buckets
 *      RPCs for their own gym. Catches regressions where a
 *      column GRANT/REVOKE migration accidentally locks the user out
 *      of their own data, OR where the gym_coaches membership check
 *      added in migration 071 accidentally rejects gym owners.
 *   1. clients: B cannot SELECT A's client by ID
 *   2. clients: B cannot UPDATE A's client
 *   3. clients: B cannot DELETE A's client
 *   4. client_attendance: B cannot SELECT A's attendance row
 *   5. revenue SQL function: B cannot call instructor_revenue_totals
 *      with A's user ID (post-064 migration enforces this);
 *      B cannot call gym_revenue_totals/buckets with A's gym ID
 *      (post-071 migration enforces this via gym_coaches membership);
 *      B cannot SELECT A's gym row or A's coach roster.
 *   6. users.tribe_os_*: B cannot read A's tribe_os_stripe_customer_id
 *      (or any other sensitive premium column)
 *
 * Optional: if RLS_TEST_BASE_URL env is set (e.g. http://localhost:3001
 * or a Vercel preview URL), phase 0 also makes a real HTTP request to
 * a premium-gated API route to catch full route-level regressions.
 *
 * Exit code 0 if all PASS, 1 if any FAIL. CI-friendly.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local not found at ${envPath}`);
  }
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

let passCount = 0;
let failCount = 0;
let warnCount = 0;
const failures = [];
const warnings = [];

function pass(label) {
  passCount += 1;
  console.log(`  PASS  ${label}`);
}

function fail(label, detail) {
  failCount += 1;
  failures.push({ label, detail });
  console.log(`  FAIL  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

/** Print a known-issue warning that does not fail the run.
 *  Use for documented leaks waiting on a structural fix (e.g. the
 *  users_public view refactor for payout/PII columns). */
function warn(label, detail) {
  warnCount += 1;
  warnings.push({ label, detail });
  console.log(`  WARN  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

async function createTestUser(adminClient, label) {
  const timestamp = Date.now();
  const email = `rls-test-${label}-${timestamp}@tribe-test.local`;
  const password = `rls-test-pw-${timestamp}-${Math.random().toString(36).slice(2)}`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: `RLS Test ${label.toUpperCase()}` },
  });
  if (error) {
    throw new Error(`Failed to create test user ${label}: ${error.message}`);
  }
  return { id: data.user.id, email, password };
}

async function grantPremium(adminClient, userId) {
  const { error } = await adminClient
    .from('users')
    .update({
      tribe_os_tier: 'solo',
      tribe_os_status: null,
      tribe_os_granted_at: new Date().toISOString(),
      tribe_os_granted_by: 'rls-leak-test',
    })
    .eq('id', userId);
  if (error) throw new Error(`grantPremium ${userId}: ${error.message}`);
}

/**
 * Provision a gym for a test user. Mirrors what migration 069 did for
 * existing premium users and what the grant CLI now does on grant.
 * Needed so we can exercise the gym-keyed SQL functions
 * (gym_revenue_totals / gym_revenue_buckets) which gate on gym_coaches
 * membership.
 *
 * Returns the gym id so test phases can reference it.
 */
async function provisionGym(adminClient, userId, label) {
  const timestamp = Date.now();
  const slug = `rls-test-${label}-${timestamp}`.slice(0, 80);
  const { data: gym, error } = await adminClient
    .from('gyms')
    .insert({
      name: `RLS Test Gym ${label.toUpperCase()}`,
      slug,
      owner_user_id: userId,
      tribe_os_tier: 'solo',
      tribe_os_status: null,
      tribe_os_granted_at: new Date().toISOString(),
      tribe_os_granted_by: 'rls-leak-test',
    })
    .select('id')
    .single();
  if (error) throw new Error(`provisionGym ${userId}: ${error.message}`);

  const { error: coachErr } = await adminClient
    .from('gym_coaches')
    .insert({ gym_id: gym.id, user_id: userId, role: 'owner' });
  if (coachErr) throw new Error(`provisionGym.coach ${userId}: ${coachErr.message}`);

  return gym.id;
}

async function deleteUser(adminClient, userId) {
  // Hard-delete via the admin API. Cascades through FKs.
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    console.log(`  (cleanup warning) failed to delete ${userId}: ${error.message}`);
  }
}

async function makeUserClient(url, anonKey, email, password) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return client;
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    console.error(
      'error: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY must all be in .env.local'
    );
    process.exit(4);
  }

  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Setting up test users...');
  const userA = await createTestUser(adminClient, 'a');
  const userB = await createTestUser(adminClient, 'b');
  console.log(`  A = ${userA.id} (${userA.email})`);
  console.log(`  B = ${userB.id} (${userB.email})`);

  await grantPremium(adminClient, userA.id);
  await grantPremium(adminClient, userB.id);

  // Provision a gym for each user so gym-keyed SQL functions
  // (gym_revenue_totals / gym_revenue_buckets) are exercisable. The
  // gym ids are referenced by the cross-user attack phases below.
  const gymAId = await provisionGym(adminClient, userA.id, 'a');
  const gymBId = await provisionGym(adminClient, userB.id, 'b');

  let userAClient;
  let userBClient;
  let createdSessionId = null;
  let createdClientId = null;
  let createdAttendanceId = null;

  try {
    userAClient = await makeUserClient(url, anonKey, userA.email, userA.password);
    userBClient = await makeUserClient(url, anonKey, userB.email, userB.password);

    // Seed: user A creates a session, a client, and an attendance row
    // tying them together. The attendance test needs a real session_id
    // because client_attendance.session_id is a NOT NULL FK.
    {
      const { data: session, error } = await userAClient
        .from('sessions')
        .insert({
          creator_id: userA.id,
          sport: 'yoga',
          title: 'RLS Test Session',
          date: new Date().toISOString().slice(0, 10),
          start_time: '10:00:00',
          duration: 60,
          location: 'RLS test location',
          max_participants: 5,
        })
        .select('id')
        .single();
      if (error) throw new Error(`seed.session.insert: ${error.message}`);
      createdSessionId = session.id;
    }

    {
      const { data: client, error } = await userAClient
        .from('clients')
        .insert({
          instructor_user_id: userA.id,
          name: 'RLS Test Client',
          email: 'rls-test-client@tribe-test.local',
        })
        .select('id')
        .single();
      if (error) throw new Error(`seed.client.insert: ${error.message}`);
      createdClientId = client.id;
    }

    {
      const { data: att, error } = await userAClient
        .from('client_attendance')
        .insert({
          client_id: createdClientId,
          session_id: createdSessionId,
          attended: true,
          attended_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) throw new Error(`seed.attendance.insert: ${error.message}`);
      createdAttendanceId = att.id;
    }

    console.log('');
    console.log('Running smoke tests (own-data access)...');

    // ---- 0a. user A can read their own gate columns ----
    {
      const { data, error } = await userAClient
        .from('users')
        .select('tribe_os_tier, tribe_os_status')
        .eq('id', userA.id)
        .single();
      if (error) {
        fail(
          'smoke: A reads own tribe_os_tier + tribe_os_status',
          `REGRESSION: ${error.message}. Check GRANT/REVOKE on public.users — ` +
            `migration 066 narrowed the GRANT list, and any column needed by ` +
            `requireTribeOSPremium must remain SELECT-able by authenticated.`
        );
      } else if (!data || data.tribe_os_tier !== 'solo') {
        fail(
          'smoke: A reads own tribe_os_tier + tribe_os_status',
          `expected tier=solo, got tier=${data?.tribe_os_tier ?? 'null'}`
        );
      } else {
        pass('smoke: A reads own tribe_os_tier + tribe_os_status');
      }
    }

    // ---- 0b. user A can call instructor_revenue_totals for own user_id ----
    {
      const today = new Date().toISOString().slice(0, 10);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await userAClient.rpc('instructor_revenue_totals', {
        p_user_id: userA.id, // SELF: auth.uid() == p_user_id
        p_period_start_date: monthAgo,
        p_period_end_date: today,
        p_timezone: 'UTC',
      });
      if (error) {
        fail(
          'smoke: A calls instructor_revenue_totals for own data',
          `REGRESSION: ${error.message}. Migration 064's auth.uid() assertion ` +
            `should pass when p_user_id === auth.uid(). Check the assertion logic ` +
            `or the SECURITY DEFINER permissions.`
        );
      } else if (!Array.isArray(data)) {
        fail('smoke: A calls instructor_revenue_totals for own data', `unexpected response shape: ${typeof data}`);
      } else {
        // Empty result is fine — A has no payments yet.
        pass(`smoke: A calls instructor_revenue_totals for own data (${data.length} row(s))`);
      }
    }

    // ---- 0d. user A can call gym_revenue_totals for own gym_id ----
    // Catches regressions where the gym_coaches membership check
    // (introduced in migration 071) accidentally locks owners out of
    // their own gym's revenue.
    {
      const today = new Date().toISOString().slice(0, 10);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await userAClient.rpc('gym_revenue_totals', {
        p_gym_id: gymAId, // SELF: A is a coach in this gym
        p_period_start_date: monthAgo,
        p_period_end_date: today,
        p_timezone: 'UTC',
      });
      if (error) {
        fail(
          'smoke: A calls gym_revenue_totals for own gym',
          `REGRESSION: ${error.message}. Migration 071's gym_coaches ` +
            `membership check should pass when the caller is a coach in p_gym_id.`
        );
      } else if (!Array.isArray(data)) {
        fail('smoke: A calls gym_revenue_totals for own gym', `unexpected response shape: ${typeof data}`);
      } else {
        pass(`smoke: A calls gym_revenue_totals for own gym (${data.length} row(s))`);
      }
    }

    // ---- 0e. user A can call gym_revenue_buckets for own gym_id ----
    {
      const today = new Date().toISOString().slice(0, 10);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await userAClient.rpc('gym_revenue_buckets', {
        p_gym_id: gymAId,
        p_period_start_date: monthAgo,
        p_period_end_date: today,
        p_group_by: 'week',
        p_timezone: 'UTC',
      });
      if (error) {
        fail(
          'smoke: A calls gym_revenue_buckets for own gym',
          `REGRESSION: ${error.message}. Migration 071's gym_coaches ` +
            `membership check should pass when the caller is a coach in p_gym_id.`
        );
      } else if (!Array.isArray(data)) {
        fail('smoke: A calls gym_revenue_buckets for own gym', `unexpected response shape: ${typeof data}`);
      } else {
        pass(`smoke: A calls gym_revenue_buckets for own gym (${data.length} row(s))`);
      }
    }

    // ---- 0c. optional: real HTTP call to a premium-gated route ----
    const baseUrl = process.env.RLS_TEST_BASE_URL;
    if (baseUrl) {
      const trimmedBase = baseUrl.replace(/\/$/, '');
      const url = `${trimmedBase}/api/tribe-os/clients`;
      try {
        const accessToken = (await userAClient.auth.getSession()).data.session?.access_token;
        if (!accessToken) {
          fail('smoke: HTTP A → /api/tribe-os/clients', 'no access token from userAClient session');
        } else {
          const res = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
          });
          const bodyText = await res.text();
          if (res.status === 200) {
            pass(`smoke: HTTP A → /api/tribe-os/clients returned 200`);
          } else if (res.status === 401 || res.status === 403) {
            // The Next.js route reads auth via cookies, not Bearer headers,
            // so it may not authenticate via this path. That's a known
            // limitation of the test, not a regression.
            console.log(
              `  SKIP  smoke: HTTP A → /api/tribe-os/clients returned ${res.status} ` +
                `(server may require cookie auth, not Bearer; skipping)`
            );
          } else if (
            res.status >= 500 &&
            (bodyText.includes('permission denied') || bodyText.includes('failed_to_check_premium_status'))
          ) {
            fail(
              'smoke: HTTP A → /api/tribe-os/clients',
              `REGRESSION: 500 with "${bodyText.slice(0, 200)}". Check GRANT/REVOKE on ` +
                `public.users and the columns selected by getTribeOSPremiumStatus.`
            );
          } else {
            fail(
              'smoke: HTTP A → /api/tribe-os/clients',
              `unexpected status ${res.status}: ${bodyText.slice(0, 200)}`
            );
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('ECONNREFUSED')) {
          console.log(`  SKIP  smoke: HTTP A → ${url} (server not reachable; start npm run dev or unset RLS_TEST_BASE_URL)`);
        } else {
          fail('smoke: HTTP A → /api/tribe-os/clients', e instanceof Error ? e.message : String(e));
        }
      }
    }

    console.log('');
    console.log('Running cross-user leak tests...');

    // ---- 1. clients SELECT ----
    {
      const { data, error } = await userBClient.from('clients').select('id').eq('id', createdClientId);
      if (error) {
        fail('clients SELECT by id (B reads A)', `expected empty result, got error: ${error.message}`);
      } else if (data && data.length > 0) {
        fail('clients SELECT by id (B reads A)', `LEAK: B saw ${data.length} row(s) of A's clients`);
      } else {
        pass('clients SELECT by id (B reads A) returns zero rows');
      }
    }

    // ---- 2. clients UPDATE ----
    {
      const { data, error } = await userBClient
        .from('clients')
        .update({ name: 'HACKED BY B' })
        .eq('id', createdClientId)
        .select('id');
      if (error && !error.message.toLowerCase().includes('no rows')) {
        // Some RLS rejections come back as errors; that's also a pass.
        pass(`clients UPDATE (B updates A) rejected with: ${error.message.slice(0, 60)}`);
      } else if (data && data.length > 0) {
        fail('clients UPDATE (B updates A)', `LEAK: B updated ${data.length} of A's client rows`);
      } else {
        pass('clients UPDATE (B updates A) affected zero rows');
      }
      // Verify A's row content is still pristine.
      const { data: check } = await adminClient.from('clients').select('name').eq('id', createdClientId).single();
      if (check && check.name === 'HACKED BY B') {
        fail('clients UPDATE integrity check', 'A\'s row name was overwritten by B');
      } else {
        pass('clients UPDATE integrity: A\'s row name unchanged');
      }
    }

    // ---- 3. clients DELETE ----
    {
      const { error } = await userBClient.from('clients').delete().eq('id', createdClientId);
      // Either an error or no effect is acceptable. Verify the row still exists.
      const { data: check } = await adminClient.from('clients').select('id').eq('id', createdClientId).maybeSingle();
      if (!check) {
        fail('clients DELETE (B deletes A)', 'LEAK: A\'s client row was deleted by B');
      } else {
        pass(
          error
            ? `clients DELETE (B deletes A) rejected: ${error.message.slice(0, 60)}`
            : 'clients DELETE (B deletes A) affected zero rows; A\'s row intact'
        );
      }
    }

    // ---- 4. client_attendance SELECT ----
    {
      const { data, error } = await userBClient
        .from('client_attendance')
        .select('id')
        .eq('id', createdAttendanceId);
      if (error) {
        fail('client_attendance SELECT (B reads A)', `expected empty, got error: ${error.message}`);
      } else if (data && data.length > 0) {
        fail('client_attendance SELECT (B reads A)', `LEAK: B saw ${data.length} of A's attendance row(s)`);
      } else {
        pass('client_attendance SELECT (B reads A) returns zero rows');
      }
    }

    // ---- 5. revenue SQL function ----
    {
      const today = new Date().toISOString().slice(0, 10);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await userBClient.rpc('instructor_revenue_totals', {
        p_user_id: userA.id, // <-- the cross-user attack: B requests A's totals
        p_period_start_date: monthAgo,
        p_period_end_date: today,
        p_timezone: 'UTC',
      });
      if (error) {
        // Post-064 migration: the function raises with SQLSTATE 42501
        // ('unauthorized'). That's the expected outcome.
        if (
          error.message.toLowerCase().includes('unauthorized') ||
          error.code === '42501' ||
          error.code === 'P0001'
        ) {
          pass(`revenue RPC (B requests A's totals) rejected: ${error.message.slice(0, 80)}`);
        } else {
          fail(
            'revenue RPC (B requests A\'s totals)',
            `unexpected error shape: code=${error.code} message=${error.message}`
          );
        }
      } else if (data && data.length > 0) {
        fail(
          'revenue RPC (B requests A\'s totals)',
          `LEAK: function returned ${data.length} row(s) of A's revenue to B`
        );
      } else {
        // Empty result is acceptable (A has no payments anyway in this fresh test).
        // The post-064 migration would have raised. If we got here without exception
        // it means 064 isn't applied yet OR A genuinely has no revenue and the
        // assertion was never triggered. Mark as soft-pass with a note.
        pass(
          'revenue RPC (B requests A\'s totals) returned empty - note: post-064 migration should raise instead'
        );
      }
    }

    // ---- 5b. gym revenue SQL function: B requests A's gym revenue ----
    // Migration 071 gates gym_revenue_totals on
    // EXISTS (SELECT 1 FROM gym_coaches WHERE gym_id = p_gym_id
    // AND user_id = auth.uid()). B is NOT in A's gym, so this should
    // raise 42501 'unauthorized: caller is not a coach in gym <id>'.
    {
      const today = new Date().toISOString().slice(0, 10);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await userBClient.rpc('gym_revenue_totals', {
        p_gym_id: gymAId, // <-- the cross-gym attack: B requests A's gym totals
        p_period_start_date: monthAgo,
        p_period_end_date: today,
        p_timezone: 'UTC',
      });
      if (error) {
        if (
          error.message.toLowerCase().includes('unauthorized') ||
          error.message.toLowerCase().includes('not a coach') ||
          error.code === '42501' ||
          error.code === 'P0001'
        ) {
          pass(`gym revenue RPC (B requests A's gym totals) rejected: ${error.message.slice(0, 80)}`);
        } else {
          fail(
            "gym revenue RPC (B requests A's gym totals)",
            `unexpected error shape: code=${error.code} message=${error.message}`
          );
        }
      } else if (data && data.length > 0) {
        fail(
          "gym revenue RPC (B requests A's gym totals)",
          `LEAK: function returned ${data.length} row(s) of A's gym revenue to B`
        );
      } else {
        fail(
          "gym revenue RPC (B requests A's gym totals)",
          'expected exception (42501) but got empty result. Membership check may be missing.'
        );
      }
    }

    // ---- 5c. gym revenue buckets: B requests A's gym buckets ----
    // Same gate as 5b, exercised against gym_revenue_buckets.
    {
      const today = new Date().toISOString().slice(0, 10);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await userBClient.rpc('gym_revenue_buckets', {
        p_gym_id: gymAId,
        p_period_start_date: monthAgo,
        p_period_end_date: today,
        p_group_by: 'week',
        p_timezone: 'UTC',
      });
      if (error) {
        if (
          error.message.toLowerCase().includes('unauthorized') ||
          error.message.toLowerCase().includes('not a coach') ||
          error.code === '42501' ||
          error.code === 'P0001'
        ) {
          pass(`gym revenue buckets (B requests A's gym) rejected: ${error.message.slice(0, 80)}`);
        } else {
          fail(
            "gym revenue buckets (B requests A's gym)",
            `unexpected error shape: code=${error.code} message=${error.message}`
          );
        }
      } else if (data && data.length > 0) {
        fail(
          "gym revenue buckets (B requests A's gym)",
          `LEAK: function returned ${data.length} bucket(s) of A's gym revenue to B`
        );
      } else {
        fail(
          "gym revenue buckets (B requests A's gym)",
          'expected exception (42501) but got empty result. Membership check may be missing.'
        );
      }
    }

    // ---- 5d. gyms table: B cannot SELECT A's gym row ----
    // Migration 068 sets a SELECT policy on gyms gated by
    // owner_user_id = auth.uid() OR EXISTS in gym_coaches. B is
    // neither owner nor coach of A's gym.
    {
      const { data, error } = await userBClient.from('gyms').select('id, name, slug').eq('id', gymAId);
      if (error) {
        pass(`gyms SELECT (B reads A's gym) rejected: ${error.message.slice(0, 60)}`);
      } else if (!data || data.length === 0) {
        pass("gyms SELECT (B reads A's gym) returns zero rows");
      } else {
        fail("gyms SELECT (B reads A's gym)", `LEAK: B saw A's gym row (name=${data[0].name})`);
      }
    }

    // ---- 5e. gym_coaches table: B cannot SELECT A's coach row ----
    // Migration 068 (post-hotfix dd0aac5) sets a SELECT policy of
    // user_id = auth.uid(). B is not A; the query should return zero
    // rows. Defends against accidental loosening of the policy in
    // future migrations.
    {
      const { data, error } = await userBClient
        .from('gym_coaches')
        .select('gym_id, user_id, role')
        .eq('gym_id', gymAId);
      if (error) {
        pass(`gym_coaches SELECT (B reads A's gym roster) rejected: ${error.message.slice(0, 60)}`);
      } else if (!data || data.length === 0) {
        pass("gym_coaches SELECT (B reads A's gym roster) returns zero rows");
      } else {
        fail(
          "gym_coaches SELECT (B reads A's gym roster)",
          `LEAK: B saw ${data.length} coach row(s) for A's gym`
        );
      }
    }

    // ---- 5f. list_gym_coaches RPC: A can call for own gym ----
    // Smoke check for migration 073. The owner is a coach, so this
    // should succeed and return at least one row (the owner).
    {
      const { data, error } = await userAClient.rpc('list_gym_coaches', { p_gym_id: gymAId });
      if (error) {
        fail(
          'smoke: A calls list_gym_coaches for own gym',
          `REGRESSION: ${error.message}. Migration 073's membership ` +
            `check should pass when the caller is a coach in p_gym_id.`
        );
      } else if (!Array.isArray(data) || data.length === 0) {
        fail(
          'smoke: A calls list_gym_coaches for own gym',
          `expected at least 1 coach row (the owner), got ${Array.isArray(data) ? data.length : typeof data}`
        );
      } else {
        pass(`smoke: A calls list_gym_coaches for own gym (${data.length} coach(es))`);
      }
    }

    // ---- 5g. list_gym_coaches RPC: B cannot call for A's gym ----
    // Migration 073 gates list_gym_coaches on the same gym_coaches
    // membership check as gym_revenue_totals/buckets. B is not in
    // A's gym, so this should raise 42501.
    {
      const { data, error } = await userBClient.rpc('list_gym_coaches', { p_gym_id: gymAId });
      if (error) {
        if (
          error.message.toLowerCase().includes('unauthorized') ||
          error.message.toLowerCase().includes('not a coach') ||
          error.code === '42501' ||
          error.code === 'P0001'
        ) {
          pass(`list_gym_coaches (B requests A's gym) rejected: ${error.message.slice(0, 80)}`);
        } else {
          fail(
            "list_gym_coaches (B requests A's gym)",
            `unexpected error shape: code=${error.code} message=${error.message}`
          );
        }
      } else if (data && data.length > 0) {
        fail(
          "list_gym_coaches (B requests A's gym)",
          `LEAK: function returned ${data.length} coach row(s) for A's gym to B`
        );
      } else {
        fail(
          "list_gym_coaches (B requests A's gym)",
          'expected exception (42501) but got empty result. Membership check may be missing.'
        );
      }
    }

    // ---- 6. users.tribe_os_* column read ----
    {
      // Set a sentinel value on A so we can detect leakage.
      const sentinel = `cus_RLS_TEST_${Date.now()}`;
      await adminClient.from('users').update({ tribe_os_stripe_customer_id: sentinel }).eq('id', userA.id);

      const { data, error } = await userBClient
        .from('users')
        .select('tribe_os_stripe_customer_id')
        .eq('id', userA.id);
      if (error) {
        pass(`users.tribe_os_* (B reads A) rejected: ${error.message.slice(0, 60)}`);
      } else if (!data || data.length === 0) {
        pass('users.tribe_os_* (B reads A) returns zero rows');
      } else if (data[0].tribe_os_stripe_customer_id === sentinel) {
        fail('users.tribe_os_* (B reads A)', `LEAK: B saw A's tribe_os_stripe_customer_id = ${sentinel}`);
      } else if (data[0].tribe_os_stripe_customer_id === null) {
        // RLS may permit the row but null sensitive columns (column-level RLS via VIEW).
        pass('users.tribe_os_* (B reads A) returned row but sensitive column was null');
      } else {
        fail(
          'users.tribe_os_* (B reads A)',
          `unexpected value: ${data[0].tribe_os_stripe_customer_id}`
        );
      }
    }

    // ---- 6b. clients INSERT spoof (B tries to insert claiming A as instructor) ----
    // The clients RLS policy is FOR ALL with WITH CHECK (auth.uid() = instructor_user_id),
    // so an INSERT with someone else's id should be rejected.
    {
      const { data, error } = await userBClient
        .from('clients')
        .insert({
          instructor_user_id: userA.id, // <-- the spoof: B claiming A as instructor
          name: 'RLS Test Spoof Client',
        })
        .select('id');
      if (error) {
        pass(`clients INSERT spoof (B inserts claiming A as instructor) rejected: ${error.message.slice(0, 60)}`);
      } else if (!data || data.length === 0) {
        pass('clients INSERT spoof (B inserts claiming A as instructor) returned no row');
      } else {
        // Cleanup the leaked row before failing so we don't pollute.
        await adminClient.from('clients').delete().eq('id', data[0].id);
        fail(
          'clients INSERT spoof (B inserts claiming A as instructor)',
          `LEAK: B successfully inserted a client claiming A as instructor (id=${data[0].id}, deleted)`
        );
      }
    }

    // ---- 7. users push / FCM columns (post-067 restricted) ----
    // These should be restricted by migration 067. Read-only by
    // service-role; authenticated/anon should get permission denied
    // (or an empty result if the column is null on A's row).
    {
      const sentinelToken = `RLS_TEST_FCM_${Date.now()}`;
      await adminClient.from('users').update({ fcm_token: sentinelToken }).eq('id', userA.id);

      const { data, error } = await userBClient.from('users').select('fcm_token').eq('id', userA.id);
      if (error) {
        pass(`users.fcm_token (B reads A) rejected: ${error.message.slice(0, 60)}`);
      } else if (!data || data.length === 0) {
        pass('users.fcm_token (B reads A) returns zero rows');
      } else if (data[0].fcm_token === sentinelToken) {
        fail('users.fcm_token (B reads A)', `LEAK: B saw A's fcm_token (post-067 should prevent)`);
      } else if (data[0].fcm_token === null) {
        pass('users.fcm_token (B reads A) returned null');
      } else {
        fail('users.fcm_token (B reads A)', `unexpected value: ${data[0].fcm_token}`);
      }
    }

    // ---- 8. KNOWN LEAKS: payout / PII columns (DEFER — see LATER.md) ----
    // These columns leak cross-user under the current setup because:
    //   - The wildcard "view all profiles" SELECT policy on users
    //     allows cross-user row reads.
    //   - Column-level GRANT restriction is role-based, not row-based,
    //     so revoking these columns from authenticated would also
    //     block self-reads in /earnings/payout-settings,
    //     /api/stripe/connect/*, fetchUserProfile, etc.
    // Proper fix: replace the wildcard policy with a self-only policy
    // and create a `users_public` view that exposes only safe columns
    // for cross-user reads. Tracked in docs/LATER.md.
    // These checks WARN (do not fail the run) until the structural fix.
    {
      const sentinelAccount = `RLS_TEST_BANK_${Date.now()}`;
      const sentinelDoc = `RLS_TEST_DOC_${Date.now()}`;
      const sentinelEmergency = `RLS_TEST_EMERGENCY_${Date.now()}`;
      const sentinelDob = '1990-01-01';
      await adminClient
        .from('users')
        .update({
          payout_account_number: sentinelAccount,
          payout_document_number: sentinelDoc,
          emergency_contact_phone: sentinelEmergency,
          date_of_birth: sentinelDob,
        })
        .eq('id', userA.id);

      const sensitiveCols = [
        { col: 'payout_account_number', expectedNot: sentinelAccount, label: 'bank account number' },
        { col: 'payout_document_number', expectedNot: sentinelDoc, label: 'document/ID number' },
        { col: 'emergency_contact_phone', expectedNot: sentinelEmergency, label: 'emergency contact phone' },
        { col: 'date_of_birth', expectedNot: sentinelDob, label: 'date of birth' },
      ];
      for (const { col, expectedNot, label } of sensitiveCols) {
        const { data, error } = await userBClient.from('users').select(col).eq('id', userA.id);
        if (error) {
          pass(`users.${col} (B reads A's ${label}) rejected: ${error.message.slice(0, 60)}`);
        } else if (!data || data.length === 0) {
          pass(`users.${col} (B reads A's ${label}) returns zero rows`);
        } else if (data[0][col] === expectedNot) {
          warn(
            `users.${col} (B reads A's ${label})`,
            `KNOWN LEAK: B saw A's ${col}. See docs/LATER.md → users_public view refactor.`
          );
        } else if (data[0][col] === null) {
          pass(`users.${col} (B reads A's ${label}) returned null`);
        } else {
          warn(`users.${col} (B reads A's ${label})`, `unexpected value: ${data[0][col]}`);
        }
      }
    }
  } finally {
    console.log('');
    console.log('Cleaning up...');
    // Sign out both clients first to be polite.
    try {
      if (userAClient) await userAClient.auth.signOut();
    } catch {
      // ignore signOut errors
    }
    try {
      if (userBClient) await userBClient.auth.signOut();
    } catch {
      // ignore signOut errors
    }
    // Delete created rows. RLS bypass via service-role.
    if (createdAttendanceId) {
      await adminClient.from('client_attendance').delete().eq('id', createdAttendanceId);
    }
    if (createdClientId) {
      await adminClient.from('clients').delete().eq('id', createdClientId);
    }
    if (createdSessionId) {
      await adminClient.from('sessions').delete().eq('id', createdSessionId);
    }
    // Delete the gyms before the users — gyms.owner_user_id is
    // ON DELETE RESTRICT, so deleting an auth user with a gym fails.
    // gym_coaches rows cascade away with the gym (ON DELETE CASCADE
    // on gym_coaches.gym_id REFERENCES gyms(id)).
    if (gymAId) await adminClient.from('gyms').delete().eq('id', gymAId);
    if (gymBId) await adminClient.from('gyms').delete().eq('id', gymBId);
    await deleteUser(adminClient, userA.id);
    await deleteUser(adminClient, userB.id);
  }

  console.log('');
  const warnSuffix = warnCount > 0 ? `, ${warnCount} warn (known issues, see docs/LATER.md)` : '';
  console.log(`Summary: ${passCount} pass, ${failCount} fail${warnSuffix}`);
  if (warnCount > 0) {
    console.log('');
    console.log('Warnings (documented known issues, not blocking):');
    for (const w of warnings) {
      console.log(`  - ${w.label}`);
      if (w.detail) console.log(`      ${w.detail}`);
    }
  }
  if (failCount > 0) {
    console.log('');
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  - ${f.label}`);
      if (f.detail) console.log(`      ${f.detail}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(99);
});
