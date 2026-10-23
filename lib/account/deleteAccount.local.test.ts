// @vitest-environment node
/**
 * T-DEL1 on the LOCAL stack, end to end: a seeded account goes through
 * deleteAccount, the path both routes run, against a real database, real
 * buckets and a real login. Proves each personal column cleared, each side
 * table empty, each file gone from storage, the history kept, the login gone.
 *
 * Skipped unless pointed at the local stack (never production):
 *
 *   TDEL1_LOCAL=1 npx vitest run lib/account/deleteAccount.local.test.ts
 *
 * It reads the local URL and service key from .env.av.local and refuses any
 * URL that is not 127.0.0.1/localhost. Migration 228 must be applied to the
 * local stack first. Files are uploaded with the service role, which leaves
 * storage.objects.owner empty, so the owner a real upload would carry is set
 * with psql in the local database container (TDEL1_DB_CONTAINER, default
 * supabase_db_tribe-v3-athlete). Node, not jsdom: it talks to real servers,
 * and jsdom's Blob does not go through Node's fetch.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { deleteAccount } from './deleteAccount';

const ENABLED = process.env.TDEL1_LOCAL === '1';
const CONTAINER = process.env.TDEL1_DB_CONTAINER ?? 'supabase_db_tribe-v3-athlete';

function localEnv(): { url: string; key: string } {
  const file = path.resolve(__dirname, '..', '..', '..', 'tribe-v3', '.env.av.local');
  const alt = path.resolve(__dirname, '..', '..', '.env.av.local');
  const text = readFileSync(existsSync(alt) ? alt : file, 'utf8');
  const get = (k: string) => (new RegExp(`^${k}=(.*)$`, 'm').exec(text)?.[1] ?? '').replace(/^"|"$/g, '');
  const url = get('NEXT_PUBLIC_SUPABASE_URL');
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error(`refusing to run against ${url}: the local stack only`);
  }
  return { url, key: get('SUPABASE_SERVICE_ROLE_KEY') };
}

function psql(sql: string): string {
  return execFileSync('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

const BUCKETS = [
  'profile-images',
  'media',
  'session-photos',
  'session-recap-photos',
  'session-stories',
  'moments',
  'community-banners',
  'community-bulletin-flyers',
];

describe.skipIf(!ENABLED)('deleteAccount on the local stack (T-DEL1)', () => {
  let db: SupabaseClient;
  let x = '';
  let sharedLogo = '';
  let o = '';
  const ids: Record<string, string> = {};
  const xFiles: Array<[string, string]> = [];
  const keptFiles: Array<[string, string]> = [];

  async function put(bucket: string, name: string, owner: string | null, list: Array<[string, string]>) {
    // The Moments bucket takes JPEG and WebP only, by the Blob's own type.
    const type = name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const { error } = await db.storage
      .from(bucket)
      .upload(name, new Blob(['t-del1'], { type }), { upsert: true, contentType: type });
    if (error) throw new Error(`${bucket}/${name}: ${error.message}`);
    if (owner)
      psql(
        `update storage.objects set owner = '${owner}', owner_id = '${owner}' where bucket_id = '${bucket}' and name = '${name}'`
      );
    list.push([bucket, name]);
  }

  async function exists(bucket: string, name: string): Promise<boolean> {
    const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '';
    const base = name.slice(name.lastIndexOf('/') + 1);
    const { data } = await db.storage.from(bucket).list(dir, { search: base });
    return (data ?? []).some((f) => f.name === base);
  }

  async function one<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as T;
  }

  beforeAll(async () => {
    const env = localEnv();
    db = createClient(env.url, env.key, { auth: { persistSession: false } });
    for (const b of BUCKETS) await db.storage.createBucket(b, { public: true }).catch(() => undefined);

    const created = await db.auth.admin.createUser({
      email: `tdel1-${Date.now()}@test.local`,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message ?? 'no user');
    x = created.data.user.id;
    sharedLogo = `avatars/${x}-logo.jpg`;
    await db
      .from('users')
      .upsert({ id: x, email: created.data.user.email }, { onConflict: 'id', ignoreDuplicates: true });
    const other = await one<{ id: string }>(
      db.from('users').select('id').is('deleted_at', null).neq('id', x).eq('is_admin', false).limit(1).single()
    );
    o = other.id;

    await one(
      db
        .from('users')
        .update({
          name: 'Local Ximena',
          username: 'tdel1x',
          handle: `tdel1${x.slice(0, 6)}`,
          bio: 'bio',
          instructor_bio: 'coach',
          instagram_username: 'tdel1x',
          facebook_url: 'https://facebook.com/x',
          website_url: 'https://x.test',
          location: 'Laureles',
          location_lat: 6.2,
          location_lng: -75.6,
          timezone: 'America/New_York',
          avatar_url: 'https://x/a.jpg',
          banner_url: 'https://x/b.jpg',
          photos: ['https://x/p.jpg'],
          cover_image_url: 'https://x/c.jpg',
          card_photo_url: 'https://x/card.jpg',
          card_photo_box: { x0: 0, y0: 0, x1: 1, y1: 1 },
          card_photo_rejects: ['https://x/r.jpg'],
          storefront_banner_url: 'https://x/sb.jpg',
          storefront_video_url: 'https://x/v.mp4',
          storefront_tagline: 'tagline',
          specialties: ['boxing'],
          certifications: ['cert'],
          years_experience: 5,
          verified_credentials: { a: 1 },
          sports: ['Boxing'],
          preferred_sports: ['Boxing'],
          seeking_trainer: true,
          seeking_trainer_sports: ['Boxing'],
          seeking_trainer_budget: 'any',
          seeking_trainer_schedule: 'mornings',
          seeking_trainer_note: 'note',
          push_subscription: { endpoint: 'e' },
          fcm_token: 'tok',
          fcm_platform: 'ios',
          fcm_updated_at: new Date().toISOString(),
          wompi_merchant_id: 'w',
          stripe_account_id: 'acct',
          tribe_os_stripe_customer_id: 'cus',
          tribe_os_stripe_subscription_id: 'sub',
          subscription_gateway_id: 'gw',
          signup_src: 'qr',
          signup_code: 'C1',
          signup_ref: 'r',
          signup_utm_source: 's',
          signup_utm_medium: 'm',
          signup_utm_campaign: 'c',
          signup_utm_content: 'x',
          signup_landing_path: '/i/x',
          signup_first_touch: { a: 1 },
          signup_attributed_at: new Date().toISOString(),
          referral_code: `TD${x.slice(0, 6)}`,
          referred_by: o,
          preferred_language: 'es',
          preferred_language_set_at: new Date().toISOString(),
          last_login_at: new Date().toISOString(),
          last_seen_release: 'r1',
          terms_accepted: true,
          terms_accepted_at: '2026-09-01T00:00:00',
          safety_waiver_accepted: true,
          safety_waiver_accepted_at: '2026-09-01T00:00:00',
          is_instructor: true,
        })
        .eq('id', x)
        .select('id')
    );

    await one(
      db
        .from('user_private')
        .upsert({
          user_id: x,
          payout_account_number: '000123',
          payout_document_number: 'CC123',
          emergency_contact_name: 'Mamá',
          emergency_contact_phone: '3000000000',
          date_of_birth: '1990-01-01',
        })
        .select('user_id')
    );
    await one(
      db
        .from('push_subscriptions')
        .insert({ user_id: x, subscription: { endpoint: 'e' } })
        .select('id')
    );
    await one(db.from('notification_preferences').upsert({ user_id: x }).select('user_id'));
    await one(
      db
        .from('user_training_preferences')
        .insert({ user_id: x, preferred_sports: ['Boxing'] })
        .select('id')
    );
    await one(
      db
        .from('user_follows')
        .insert([
          { follower_id: x, following_id: o },
          { follower_id: o, following_id: x },
        ])
        .select('id')
    );
    await one(db.from('connections').insert({ requester_id: x, recipient_id: o, status: 'accepted' }).select('id'));

    const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const session = async (creator: string, date: string, label: string) =>
      (
        (await one(
          db
            .from('sessions')
            .insert({
              creator_id: creator,
              sport: 'Boxing',
              date,
              start_time: '07:00',
              duration: 60,
              location: label,
              max_participants: 10,
              status: 'active',
            })
            .select('id')
            .single()
        )) as { id: string }
      ).id;
    ids.past = await session(x, day(-10), 'T-DEL1 past');
    ids.future = await session(x, day(10), 'T-DEL1 future');
    ids.oPast = await session(o, day(-9), 'T-DEL1 O past');
    ids.oFuture = await session(o, day(9), 'T-DEL1 O future');
    await one(
      db
        .from('session_participants')
        .insert([
          { session_id: ids.oPast, user_id: x, status: 'confirmed' },
          { session_id: ids.oFuture, user_id: x, status: 'confirmed' },
          // O is booked on X's upcoming session: the notify step reads them.
          { session_id: ids.future, user_id: o, status: 'confirmed' },
        ])
        .select('id')
    );
    await one(
      db.from('chat_messages').insert({ session_id: ids.oPast, user_id: x, message: 'X said this' }).select('id')
    );
    await one(
      db
        .from('reviews')
        .insert({ session_id: ids.oPast, reviewer_id: x, host_id: o, rating: 5, comment: 'Gran clase' })
        .select('id')
    );
    const community = (await one(
      db.from('communities').insert({ name: 'T-DEL1 community', creator_id: o }).select('id').single()
    )) as { id: string };
    ids.community = community.id;
    await one(
      db.from('community_posts').insert({ community_id: ids.community, author_id: x, content: 'X post' }).select('id')
    );
    await one(
      db.from('storefront_media').insert({ user_id: x, media_url: 'https://x/g.jpg', media_type: 'image' }).select('id')
    );
    await one(
      db
        .from('session_stories')
        .insert({ session_id: ids.oPast, user_id: x, media_url: 'https://x/s.mp4', media_type: 'video' })
        .select('id')
    );
    await one(
      db
        .from('session_recap_photos')
        .insert({ session_id: ids.oPast, user_id: x, photo_url: 'https://x/r.jpg' })
        .select('id')
    );
    const moment = `${ids.oPast}/${crypto.randomUUID()}.jpg`;
    const media = (await one(
      db
        .from('session_media')
        .insert({ session_id: ids.oPast, uploader_id: x, storage_path: moment })
        .select('id')
        .single()
    )) as { id: string };
    const oMoment = `${ids.oPast}/${crypto.randomUUID()}.jpg`;
    const oMedia = (await one(
      db
        .from('session_media')
        .insert({ session_id: ids.oPast, uploader_id: o, storage_path: oMoment })
        .select('id')
        .single()
    )) as { id: string };
    await one(
      db
        .from('session_media_tags')
        .insert([
          { media_id: media.id, user_id: o },
          { media_id: oMedia.id, user_id: x },
        ])
        .select('id')
    );
    ids.oMedia = oMedia.id;

    // Other people's data X controls (Al's seven calls). Z owns the gym X
    // coaches at and Y owns a partner listing: two throwaway accounts, so a
    // refusal that failed could never delete a real local user.
    const throwaway = async (label: string) => {
      const made = await db.auth.admin.createUser({
        email: `tdel1-${label}-${Date.now()}@test.local`,
        password: crypto.randomUUID(),
        email_confirm: true,
      });
      if (made.error || !made.data.user) throw new Error(made.error?.message ?? 'no user');
      await db
        .from('users')
        .upsert({ id: made.data.user.id, email: made.data.user.email }, { onConflict: 'id', ignoreDuplicates: true });
      return made.data.user.id;
    };
    ids.z = await throwaway('z');
    ids.y = await throwaway('y');
    ids.gym = (
      await one<{ id: string }>(
        db
          .from('gyms')
          .insert({ name: 'T-DEL1 gym', slug: `tdel1-${ids.z.slice(0, 8)}`, owner_user_id: ids.z })
          .select('id')
          .single()
      )
    ).id;
    ids.partner = (
      await one<{ id: string }>(
        db
          .from('featured_partners')
          .insert({ user_id: ids.y, business_name: 'T-DEL1 partner', slug: `tdel1-${ids.y.slice(0, 8)}` })
          .select('id')
          .single()
      )
    ).id;
    ids.gymClient = (
      await one<{ id: string }>(
        db.from('clients').insert({ instructor_user_id: x, name: 'Gym client', gym_id: ids.gym }).select('id').single()
      )
    ).id;
    ids.ownClient = (
      await one<{ id: string }>(
        db.from('clients').insert({ instructor_user_id: x, name: 'Own client' }).select('id').single()
      )
    ).id;
    await one(
      db
        .from('tips')
        .insert([
          { tipper_id: x, instructor_id: o, amount_cents: 1000, currency: 'COP', gateway: 'wompi' },
          { tipper_id: o, instructor_id: x, amount_cents: 2000, currency: 'COP', gateway: 'wompi' },
        ])
        .select('id')
    );
    await one(
      db
        .from('subscription_payments')
        .insert({
          user_id: x,
          tier: 'plus',
          amount_cents: 5000,
          currency: 'COP',
          gateway: 'wompi',
          status: 'approved',
          period_start: day(-30),
          period_end: day(0),
        })
        .select('id')
    );
    await one(
      db
        .from('training_interest')
        .insert([
          { athlete_id: x, instructor_id: o },
          { athlete_id: o, instructor_id: x },
        ])
        .select('id')
    );
    await one(
      db
        .from('session_subscriptions')
        .insert({ user_id: x, session_id: ids.oFuture, instructor_id: o, status: 'active' })
        .select('id')
    );
    await one(db.from('lead_reaches').insert({ instructor_id: o, athlete_id: x }).select('id'));
    ids.liveInvite = `tdel1-live-${x}`;
    ids.usedInvite = `tdel1-used-${x}`;
    await one(
      db
        .from('invite_tokens')
        .insert([
          {
            session_id: ids.future,
            token: ids.liveInvite,
            created_by: x,
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          },
          {
            session_id: ids.past,
            token: ids.usedInvite,
            created_by: x,
            expires_at: new Date(Date.now() - 7 * 86400000).toISOString(),
          },
        ])
        .select('id')
    );
    ids.openMediaInvite = crypto.randomUUID().replace(/-/g, '');
    ids.claimedMediaInvite = crypto.randomUUID().replace(/-/g, '');
    const week = new Date(Date.now() + 7 * 86400000).toISOString();
    await one(
      db
        .from('media_invites')
        .insert([
          { session_id: ids.past, display_name: 'Nadie', token: ids.openMediaInvite, created_by: x, expires_at: week },
          {
            session_id: ids.past,
            display_name: 'O',
            token: ids.claimedMediaInvite,
            created_by: x,
            expires_at: week,
            claimed_by: o,
            claimed_at: new Date().toISOString(),
          },
        ])
        .select('id')
    );

    // Their files, one per way the listing finds them, and files that must stay.
    await put('profile-images', `avatars/${x}/a.jpg`, x, xFiles);
    await put('profile-images', `banners/banner${x.slice(0, 8)}.jpg`, x, xFiles);
    await put('profile-images', `photos/photo${x.slice(0, 8)}.jpg`, x, xFiles);
    await put('media', `storefront-banners/${x}/sb.jpg`, x, xFiles);
    await put('session-photos', `${x}/past.jpg`, x, xFiles);
    await put('session-stories', `${ids.oPast}/${x}/story.jpg`, x, xFiles);
    await put('community-bulletin-flyers', `${x}/flyer.jpg`, x, xFiles);
    await put('profile-images', `card-photos/${x}-0123456789abcdef.jpg`, null, xFiles);
    await put('session-recap-photos', `${ids.oPast}/${x}/recap.jpg`, null, xFiles);
    await put('moments', moment, null, xFiles);
    await put('moments', `${moment}.1200.webp`, null, xFiles);
    await put('moments', `${moment}.400.webp`, null, xFiles);
    await put('profile-images', `community-covers/${ids.community}/cover.jpg`, x, keptFiles);
    await put('community-banners', `${ids.community}/banner.jpg`, x, keptFiles);
    await put('moments', oMoment, null, keptFiles);
    // T-DEL2 (230): X's upload that Y's partner listing uses as its logo, the
    // shape that took /g/bullbox's logo on 2026-10-23. It must stay.
    await put('profile-images', sharedLogo, x, keptFiles);
    await one(
      db
        .from('featured_partners')
        .update({ logo_url: `http://127.0.0.1:54321/storage/v1/object/public/profile-images/${sharedLogo}` })
        .eq('id', ids.partner)
        .select('id')
    );
  }, 120_000);

  afterAll(async () => {
    if (!db) return;
    for (const [bucket, name] of keptFiles) await db.storage.from(bucket).remove([name]);
    if (ids.community) await db.from('communities').delete().eq('id', ids.community);
    if (ids.gymClient) await db.from('clients').delete().eq('id', ids.gymClient);
    if (ids.gym) await db.from('gyms').delete().eq('id', ids.gym);
    if (ids.partner) await db.from('featured_partners').delete().eq('id', ids.partner);
    for (const id of [ids.z, ids.y].filter(Boolean)) {
      await db.auth.admin.deleteUser(id);
      await db.from('users').delete().eq('id', id);
    }
  });

  it('refuses a gym owner and a partner-listing owner, and deletes nothing of theirs', async () => {
    expect(await deleteAccount(db, ids.z)).toEqual({ ok: false, step: 'check', error: 'owns_gym' });
    expect(await deleteAccount(db, ids.y)).toEqual({ ok: false, step: 'check', error: 'owns_partner' });
    const names = await one<Array<{ id: string; deleted_at: string | null }>>(
      db.from('users').select('id, deleted_at').in('id', [ids.z, ids.y])
    );
    expect(names.map((u) => u.deleted_at)).toEqual([null, null]);
    expect((await db.auth.admin.getUserById(ids.y)).data.user).not.toBeNull();
  });

  it('runs every step and reports the files it deleted', async () => {
    for (const [bucket, name] of xFiles) expect(await exists(bucket, name), `${bucket}/${name} seeded`).toBe(true);
    const out = await deleteAccount(db, x);
    // No push secret on the local stack, so the notice is skipped, not sent;
    // which sessions and athletes it goes to is pinned by deleteAccount.test.ts.
    expect(out).toMatchObject({ ok: true, filesDeleted: xFiles.length, notified: { failed: 0 } });
    // T-DEL2: the shared logo is reported as kept, with the row that uses it.
    expect(out.ok && out.filesKept).toEqual([
      {
        bucket: 'profile-images',
        path: sharedLogo,
        table: 'featured_partners',
        column: 'logo_url',
        rowId: ids.partner,
      },
    ]);
  }, 120_000);

  it("each of their files is gone from storage; the community cover, banner, O's Moment and the shared logo stay", async () => {
    for (const [bucket, name] of xFiles) expect(await exists(bucket, name), `${bucket}/${name}`).toBe(false);
    for (const [bucket, name] of keptFiles) expect(await exists(bucket, name), `${bucket}/${name}`).toBe(true);
  });

  it('every personal column is cleared, and the consent records stay', async () => {
    const u = (await one(db.from('users').select('*').eq('id', x).single())) as Record<string, unknown>;
    expect(u.email).toBe(`deleted-${x}@deleted.invalid`);
    expect(u.name).toBe('Usuario eliminado');
    const nulls = [
      'username',
      'handle',
      'bio',
      'instructor_bio',
      'instagram_username',
      'facebook_url',
      'website_url',
      'location',
      'location_lat',
      'location_lng',
      'avatar_url',
      'banner_url',
      'cover_image_url',
      'card_photo_url',
      'card_photo_box',
      'storefront_banner_url',
      'storefront_video_url',
      'storefront_tagline',
      'years_experience',
      'sports',
      'seeking_trainer_budget',
      'seeking_trainer_schedule',
      'seeking_trainer_note',
      'push_subscription',
      'fcm_token',
      'fcm_platform',
      'fcm_updated_at',
      'wompi_merchant_id',
      'stripe_account_id',
      'tribe_os_stripe_customer_id',
      'tribe_os_stripe_subscription_id',
      'subscription_gateway_id',
      'signup_src',
      'signup_code',
      'signup_ref',
      'signup_utm_source',
      'signup_utm_medium',
      'signup_utm_campaign',
      'signup_utm_content',
      'signup_landing_path',
      'signup_first_touch',
      'signup_attributed_at',
      'referral_code',
      'referred_by',
      'preferred_language',
      'preferred_language_set_at',
      'last_login_at',
      'last_seen_release',
    ];
    expect(nulls.filter((c) => u[c] !== null)).toEqual([]);
    const empties = [
      'photos',
      'card_photo_rejects',
      'specialties',
      'certifications',
      'preferred_sports',
      'seeking_trainer_sports',
    ];
    expect(empties.filter((c) => (u[c] as unknown[]).length !== 0)).toEqual([]);
    expect(u.verified_credentials).toEqual({});
    expect(u.timezone).toBe('America/Bogota');
    expect([u.seeking_trainer, u.is_active, u.is_admin]).toEqual([false, false, false]);
    expect(u.deleted_at).not.toBeNull();
    expect([u.terms_accepted, u.safety_waiver_accepted]).toEqual([true, true]);
    expect(u.terms_accepted_at).not.toBeNull();
  });

  it('each side table has no row of theirs', async () => {
    const count = async (table: string, col: string, value = x) =>
      (await db.from(table).select('*', { count: 'exact', head: true }).eq(col, value)).count;
    expect({
      user_private: await count('user_private', 'user_id'),
      push_subscriptions: await count('push_subscriptions', 'user_id'),
      notification_preferences: await count('notification_preferences', 'user_id'),
      user_training_preferences: await count('user_training_preferences', 'user_id'),
      follows_out: await count('user_follows', 'follower_id'),
      follows_in: await count('user_follows', 'following_id'),
      connections_out: await count('connections', 'requester_id'),
      connections_in: await count('connections', 'recipient_id'),
      community_posts: await count('community_posts', 'author_id'),
      storefront_media: await count('storefront_media', 'user_id'),
      session_stories: await count('session_stories', 'user_id'),
      session_recap_photos: await count('session_recap_photos', 'user_id'),
      session_media: await count('session_media', 'uploader_id'),
      session_media_tags: await count('session_media_tags', 'user_id'),
      training_interest_athlete: await count('training_interest', 'athlete_id'),
      training_interest_coach: await count('training_interest', 'instructor_id'),
      session_subscriptions_user: await count('session_subscriptions', 'user_id'),
      session_subscriptions_coach: await count('session_subscriptions', 'instructor_id'),
      lead_reaches_athlete: await count('lead_reaches', 'athlete_id'),
      lead_reaches_coach: await count('lead_reaches', 'instructor_id'),
    }).toEqual({
      user_private: 0,
      push_subscriptions: 0,
      notification_preferences: 0,
      user_training_preferences: 0,
      follows_out: 0,
      follows_in: 0,
      connections_out: 0,
      connections_in: 0,
      community_posts: 0,
      storefront_media: 0,
      session_stories: 0,
      session_recap_photos: 0,
      session_media: 0,
      session_media_tags: 0,
      training_interest_athlete: 0,
      training_interest_coach: 0,
      session_subscriptions_user: 0,
      session_subscriptions_coach: 0,
      lead_reaches_athlete: 0,
      lead_reaches_coach: 0,
    });
  });

  it('the history stays: past sessions and spots, the chat message, the review; the future is cancelled', async () => {
    const status = async (id: string) =>
      ((await one(db.from('sessions').select('status').eq('id', id).single())) as { status: string }).status;
    const spot = async (session: string) =>
      (
        (await one(
          db.from('session_participants').select('status').eq('session_id', session).eq('user_id', x).single()
        )) as { status: string }
      ).status;
    expect([await status(ids.past), await spot(ids.oPast)]).toEqual(['active', 'confirmed']);
    expect([await status(ids.future), await spot(ids.oFuture)]).toEqual(['cancelled', 'cancelled']);
    expect((await db.from('chat_messages').select('id', { count: 'exact', head: true }).eq('user_id', x)).count).toBe(
      1
    );
    const review = (await one(db.from('reviews').select('rating, comment').eq('reviewer_id', x).single())) as {
      rating: number;
      comment: string;
    };
    expect(review).toEqual({ rating: 5, comment: 'Gran clase' });
    expect(
      (await db.from('session_media').select('id', { count: 'exact', head: true }).eq('id', ids.oMedia)).count
    ).toBe(1);
  });

  it('their gym client stays with the gym, unassigned; their gym-less client is gone', async () => {
    const gymClient = await one<{ instructor_user_id: string | null; gym_id: string }>(
      db.from('clients').select('instructor_user_id, gym_id').eq('id', ids.gymClient).single()
    );
    expect(gymClient).toEqual({ instructor_user_id: null, gym_id: ids.gym });
    expect((await db.from('clients').select('id', { count: 'exact', head: true }).eq('id', ids.ownClient)).count).toBe(
      0
    );
  });

  it('live invite links and unclaimed media invites are gone; the used ones stay', async () => {
    const tokens = await one<Array<{ token: string }>>(
      db.from('invite_tokens').select('token').in('token', [ids.liveInvite, ids.usedInvite])
    );
    expect(tokens.map((t) => t.token)).toEqual([ids.usedInvite]);
    const media = await one<Array<{ token: string }>>(
      db.from('media_invites').select('token').in('token', [ids.openMediaInvite, ids.claimedMediaInvite])
    );
    expect(media.map((t) => t.token)).toEqual([ids.claimedMediaInvite]);
  });

  it('their money records outlive the login: tips both ways and the subscription payment', async () => {
    expect((await db.auth.admin.getUserById(x)).data.user).toBeNull();
    expect((await db.from('tips').select('id', { count: 'exact', head: true }).eq('tipper_id', x)).count).toBe(1);
    expect((await db.from('tips').select('id', { count: 'exact', head: true }).eq('instructor_id', x)).count).toBe(1);
    expect(
      (await db.from('subscription_payments').select('id', { count: 'exact', head: true }).eq('user_id', x)).count
    ).toBe(1);
  });

  it('the login is gone, and a second run finishes cleanly', async () => {
    const { data } = await db.auth.admin.getUserById(x);
    expect(data.user).toBeNull();
    expect(await deleteAccount(db, x)).toMatchObject({ ok: true, filesDeleted: 0 });
  });
});
