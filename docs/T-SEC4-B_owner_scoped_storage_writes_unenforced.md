# T-SEC4-B — Owner-scoped storage writes remain unenforced (media bucket)

**Status:** Open · **Priority:** Low · **Age:** Pre-existing, months old · **Known incidents:** Zero
**Related:** migrations 145 (`145_sec4_media_bucket_lockdown.sql`), 146 (`146_sec4_capture_production_media_policies.sql`); parent T-SEC4 (parked)

## Problem

Writes to the public `media` Storage bucket are governed by a **broad, bucket-only**
policy:

```
"Authenticated users can upload media"  INSERT  TO authenticated  WITH CHECK (bucket_id = 'media')
```

There is no owner check on INSERT (or UPDATE). So **any authenticated user can
create or overwrite any other user's object in `media`** — a competitor could
overwrite another instructor's storefront banner (`storefront-banners/<uid>/…`),
intro video (`storefront-videos/<uid>/intro.mp4`), or a community post image
(`community-posts/<communityId>/<uid>/…`). Path prefixes encode the owner, but
nothing enforces that the caller matches the prefix.

This is pre-existing (migration 091, months old). It is **not** a 145 regression —
145 attempted to close it and could not (see below). No known abuse to date.

## What was tried (145) and why it is parked

145 replaced the broad write policies with owner-scoped ones keyed on
`(storage.foldername(name))[n] = auth.uid()::text` (index `[2]` for
storefront-videos/banners, `[3]` for community-posts). Result in production:

- **INSERT owner-scoped policy does NOT match.** With the broad INSERT dropped,
  every upload failed. The broad INSERT had to be restored (146). Cause unknown
  after extensive investigation.
- **DELETE owner-scoped policy DOES work**, verified on the real path — it fixed
  the silent-remove bug that was orphaning storefront videos. It is kept.

### The unexplained contradiction (the thread to pull)

The **same `auth.uid()` expression** works in a `USING` clause (DELETE succeeds
for the owner, denies others) but **fails in a `WITH CHECK` clause** (INSERT
denies the owner) against the same rows and the same identity. Confirmed
tangentially: the storefront-banner INSERT policy from migration 057 — identical
shape, index `[2]` — also governs `media`, so the failure is specific and not a
blanket "auth.uid() is null" problem. Behavioral testing in SQL is blocked
because Supabase suppresses direct writes to `storage.objects` (established in
the 145 rehearsal), so this could only ever be observed through the Storage API
in production. Anyone reopening this should start here.

## Recommended approach if revisited

**Do not keep fighting the RLS `WITH CHECK`.** Move ownership enforcement OFF
storage RLS and INTO a server-side API route that uploads with the **service
role**:

- Client calls e.g. `POST /api/storefront/video` with the file.
- The route authenticates the user (its own auth), derives the path from the
  authenticated `user.id` server-side (client never chooses the uid segment),
  validates type/size, and performs the upload with the service-role client.
- Storage RLS for `media` can then be locked to service-role writes only; the
  ownership guarantee comes from the route deriving the path, not from RLS.

This sidesteps the unexplained `WITH CHECK` behavior entirely, gives one place to
enforce type/size/quota, and matches how the notify/payment routes already use
the service role for privileged operations.

## Current production state (captured in 146)

- `media`: `file_size_limit = 52428800`, `allowed_mime_types = [image/jpeg, image/png, image/webp, video/mp4]`.
- SELECT: `"Authenticated can read media"` (authenticated-only) — **required for upsert uploads** (upsert = `INSERT ... ON CONFLICT DO UPDATE`, which needs a SELECT policy on `storage.objects`).
- INSERT: `"Authenticated users can upload media"` (broad, bucket-only) — the unenforced surface this ticket is about.
- UPDATE (broad): dropped.
- DELETE: `"Users can delete own media"` (145, owner-scoped) — working.
