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

### Step 6: Update Schema Documentation

Add the change to `supabase/schema.sql` (or equivalent) so the schema file matches production.

## Rules

1. **Never change the schema without updating types** — out-of-sync types cause runtime errors
2. **Never use `.select('*')`** — explicit column lists mean schema changes don't accidentally leak new fields
3. **Document every change** — future developers (including you) need to know why columns exist
4. **Test with RLS** — verify the change works as an authenticated user, not just with service_role key
5. **One change at a time** — don't batch unrelated schema changes. Each gets its own commit.
