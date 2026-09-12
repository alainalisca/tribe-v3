---
name: migration-protocol
description: "Ensures database schema changes are tracked, typed, and propagated to all affected code. Triggers when Claude needs to add a column, create a table, modify a field, update RLS policies, change indexes, or when the user mentions 'schema', 'migration', 'new table', 'add column', 'database change', 'RLS', or 'Supabase schema'. A schema change without updating types and queries is a bug waiting to happen."
---

# Migration & Schema Change Protocol

Every database schema change must be tracked and propagated to all affected code.

## Schema Change Workflow

### Step 1: Document the Change

Before making any schema change, document it:

```markdown
## Schema Change: [date]

### What changed:
- Added column `skill_level` (text, nullable) to `sessions` table

### Why:
- Users need to filter sessions by difficulty level

### Affected code:
- `lib/dal/sessions.ts` — add to create/update/query functions
- `app/create/page.tsx` — add skill level field to form
- `components/SessionCard.tsx` — display skill level badge
- `lib/database.types.ts` — regenerate types
```

### Step 2: Regenerate Types

After the schema change is made in Supabase dashboard:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/database.types.ts
```

If Supabase CLI is not set up, manually update the type definition to match the new schema.

### Step 3: Update DAL Functions

Update all data access layer functions that touch the changed table:
- Add new fields to insert/update functions
- Add new fields to select queries (remember: no `.select('*')`)
- Update return types

### Step 4: Update Components

Find all components that use the changed entity and update them:

```bash
# Find all files that reference the changed table
grep -rn "sessions" --include="*.ts" --include="*.tsx" lib/ app/ components/
```

### Step 5: Verify RLS

If the change adds a new table:
- Enable RLS: `ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;`
- Add appropriate policies for select, insert, update, delete

If the change adds sensitive columns:
- Verify existing RLS policies don't expose the new data to unauthorized users

### Step 5b: Replacing an RLS policy

Two rules, both learned the hard way on 2026-09-10 (migrations 159 and 160).

**Enumerate the live policies first. Do not trust policy names in migration files.**

```sql
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = '<table>';
```

`DROP POLICY IF EXISTS` is **silent when the name does not match**. A replacement
that targets a name which is not the live name therefore leaves the original in
place and looks like it worked. `featured_partners` carried a fifth policy —
`"Read active partners or admin reads all"` — that existed in no migration in
this repository, had been applied by hand to production, and duplicated another
policy under a different name. Migration 159 replaced four policies correctly
and changed nothing observable, because that one survivor still refused the read.

Permissive policies are OR'd for the *row* test, but the column-privilege check
applies to every policy expression that gets planned. **One surviving policy
refuses the entire read.**

**Assert afterwards that nothing on the table still reads the forbidden column,
and fail if it does.**

```sql
DO $$
DECLARE leftover TEXT;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname)
  INTO leftover
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = '<table>'
    AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ILIKE '%from users%';

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'policies still reading users directly: %', leftover;
  END IF;
END $$;
```

A policy must never inline `EXISTS (SELECT 1 FROM users WHERE id = auth.uid()
AND is_admin = true)`. Migration 113 revoked `users.is_admin` from
`authenticated` and `anon`, so any policy expression naming it makes the table
unreadable to every client with `42501 permission denied for table users`. Use
`public.is_app_admin()` — `SECURITY DEFINER`, so it reads the column as its
owner.

### Step 5c: Row-and-column-scoped writes are not expressible in RLS or grants

When a requirement needs both "only your own row" and "only these columns", neither
mechanism can carry it, and asking for either one produces a hole rather than a
restriction.

**A policy grants the whole row.** `WITH CHECK` cannot compare against the OLD row, so
"the owner may edit these columns but not those" has no policy form. There is nothing
to write.

**A column grant has no row awareness.** `GRANT UPDATE (col) ON t TO authenticated`
says which column, never whose row, so "only your own row" has no grant form either.

The mechanism is a `SECURITY DEFINER` function that resolves the caller itself and
writes only the permitted columns. It runs as its owner, so it bypasses RLS by design
and the authorisation lives in the function body where it can see both the caller and
the intended change.

Worked examples to copy:

- `self_activate_featured_partner` (104)
- `review_venue_request` (158)
- `set_session_partner` (158)

**Migration 104 exists because of exactly this mistake.** Migration 018 created:

```sql
CREATE POLICY "Partners manage own record" ON featured_partners
  FOR UPDATE USING (auth.uid() = user_id);
```

with no `WITH CHECK`. The intent was "a partner may edit their own profile fields". What
it granted was the whole row, so any partner with a `featured_partners` row could set
`status = 'active'`, extend `expires_at`, and zero `monthly_fee_cents` straight from the
client, bypassing admin approval and, once billing is live, payment. Migration 102's
header had already claimed the UPDATE policy was admin-only, which was false. 104 dropped
the policy outright and moved activation into the RPC, because the column restriction the
policy was reaching for could not be written.

The failure mode is worth naming: a policy asked to do this does not error. It grants
more than intended and looks like it worked.

### Step 6: Update Schema Documentation

Add the change to `supabase/schema.sql` (or equivalent) so the schema file matches production.

## Rules

1. **Never change the schema without updating types** — out-of-sync types cause runtime errors
2. **Never use `.select('*')`** — explicit column lists mean schema changes don't accidentally leak new fields
3. **Document every change** — future developers (including you) need to know why columns exist
4. **Test with RLS** — verify the change works as an authenticated user, not just with service_role key
5. **One change at a time** — don't batch unrelated schema changes. Each gets its own commit.
6. **Wrap every production probe in a transaction** — `begin; <probe>; rollback;`. A
   diagnostic write against production is still a write. The T-GYM2 probe for a CHECK
   constraint on `notifications.type` was an unwrapped INSERT that only failed to land
   because the recipient id happened to violate a foreign key; a different bogus value
   would have written a real row. The probe was sound, the method was not. This applies
   to any INSERT/UPDATE/DELETE used to learn something, including constraint probes.
7. **Probe before you conclude** — a mocked DAL cannot see a permission error, so a green
   test suite proves nothing about grants or RLS. Query the live API as `anon` and as
   `authenticated` before and after. `popular_routes` has the identical broken-looking
   policy shape as the four tables 159 fixed and is not broken; only the probe could tell.
