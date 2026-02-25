---
name: dal-generator
description: "Generates and enforces the Data Access Layer pattern for all database operations. Triggers whenever Claude needs to write code that queries, inserts, updates, or deletes data from Supabase or any database. Also triggers when creating new features that touch the database, when refactoring inline database calls, or when the user mentions 'DAL', 'data layer', 'database function', or 'Supabase query'. If you're about to write `supabase.from(...)` inside a component, stop and use this skill instead."
---

# Data Access Layer Generator

All database operations go through typed functions in `lib/dal/`. Components never call Supabase directly.

## Directory Structure

```
lib/dal/
├── sessions.ts      — Session CRUD, queries, filtering
├── participants.ts  — Join, leave, kick, guest operations
├── users.ts         — Profile, preferences, admin checks
├── messages.ts      — Chat messages, reported messages
├── reviews.ts       — Ratings, review CRUD
├── stories.ts       — Session stories, media
├── live-status.ts   — Go live, end live, ping
├── notifications.ts — Push notification triggers
└── index.ts         — Barrel export
```

## Standard Function Pattern

Every DAL function follows this structure:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';

// Types for this entity (or import from database.types.ts)
interface CreateSessionInput {
  sport: string;
  date: string;
  start_time: string;
  location: string;
  max_participants: number;
  creator_id: string;
}

interface CreateSessionResult {
  success: boolean;
  data?: Session;
  error?: string;
}

/**
 * Creates a new training session.
 * 
 * @param supabase - Authenticated Supabase client
 * @param input - Session creation data (validated before calling)
 * @returns Result with created session or error
 */
export async function createSession(
  supabase: SupabaseClient,
  input: CreateSessionInput
): Promise<CreateSessionResult> {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        sport: input.sport,
        date: input.date,
        start_time: input.start_time,
        location: input.location,
        max_participants: input.max_participants,
        creator_id: input.creator_id,
        status: 'active',
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    console.error('createSession failed:', error);
    return { success: false, error: 'Failed to create session' };
  }
}
```

## Rules

1. **One file per entity** — group related operations together
2. **Typed inputs and outputs** — define interfaces for parameters and return values
3. **Consistent return type** — always `{ success, data?, error? }` pattern
4. **JSDoc on every exported function** — describe what it does, params, and return
5. **Error handling inside the function** — callers get clean results, never raw exceptions
6. **Pass `supabase` as parameter** — don't create clients inside DAL functions. The component creates the client and passes it in
7. **No UI logic** — DAL functions never call `showSuccess()`, `router.push()`, or any UI function. They return data; the component decides what to do with it
8. **Select specific columns** — never use `.select('*')`. Specify exactly which columns you need
9. **Barrel export** — `lib/dal/index.ts` re-exports everything for clean imports

## When to Create a New DAL Function

- You're about to write `supabase.from(...)` in a component → create a DAL function instead
- A component has more than 2 inline Supabase calls → extract them to DAL
- Multiple components make the same query → centralize in DAL
- You need the same data transformation in multiple places → put it in DAL

## Existing DAL Functions

Check `lib/sessions.ts` for the `joinSession()` function — this is the established pattern. New DAL functions should follow the same structure.

## Migration Strategy

When you encounter inline Supabase calls in existing code:
1. Don't refactor everything at once
2. When modifying a file, extract any Supabase calls you touch into DAL
3. Leave untouched queries for future sessions
4. Always inform the user what you extracted
