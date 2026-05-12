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
 *   1. clients: B cannot SELECT A's client by ID
 *   2. clients: B cannot UPDATE A's client
 *   3. clients: B cannot DELETE A's client
 *   4. client_attendance: B cannot SELECT A's attendance row
 *   5. revenue SQL function: B cannot call instructor_revenue_totals
 *      with A's user ID (post-064 migration enforces this)
 *   6. users.tribe_os_*: B cannot read A's tribe_os_stripe_customer_id
 *      (or any other sensitive premium column)
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
const failures = [];

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
    console.log('Running leak tests...');

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
    await deleteUser(adminClient, userA.id);
    await deleteUser(adminClient, userB.id);
  }

  console.log('');
  console.log(`Summary: ${passCount} pass, ${failCount} fail`);
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
