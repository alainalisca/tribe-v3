---
name: test-scaffolder
description: "Generates test files for critical functions — data access layer functions, validation logic, utility functions, and business logic. Triggers when Claude creates or modifies files in lib/, lib/dal/, or any file containing validation, calculation, or data transformation logic. Also triggers when the user mentions 'test', 'testing', 'unit test', 'coverage', 'Vitest', 'Jest', or 'spec'. Focuses on high-value tests for functions where bugs are most expensive, not 100% coverage."
---

# Test Scaffolder

Write tests for functions where bugs are expensive. Not everything needs tests — but critical business logic does.

## What to Test (Priority Order)

1. **DAL functions** (`lib/dal/*.ts`) — join logic, session creation, participant management
2. **Validation functions** — input validation, capacity checks, permission checks
3. **Utility functions** (`lib/*.ts`) — date formatting, distance calculation, translations
4. **Data transformations** — functions that reshape data between DB format and UI format

## What NOT to Test

- React component rendering (too brittle, too slow)
- Supabase client setup (infrastructure, not logic)
- CSS/styling (use visual testing instead)
- Third-party library behavior

## Test File Convention

Tests live next to the file they test:

```
lib/
├── sessions.ts
├── sessions.test.ts     ← test file
├── dal/
│   ├── sessions.ts
│   └── sessions.test.ts ← test file
└── utils.ts
    └── utils.test.ts    ← test file
```

## Test Structure

Use Vitest (preferred for Next.js) or Jest:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { joinSession } from './sessions';

describe('joinSession', () => {
  // Happy path
  it('should join an open session successfully', async () => {
    const mockSupabase = createMockSupabase({
      sessions: [{ id: '1', status: 'active', max_participants: 10, current_participants: 3 }],
    });

    const result = await joinSession({
      supabase: mockSupabase,
      sessionId: '1',
      userId: 'user-1',
      userName: 'Test User',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('confirmed');
  });

  // Error: session full
  it('should reject when session is full', async () => {
    const mockSupabase = createMockSupabase({
      sessions: [{ id: '1', status: 'active', max_participants: 5, current_participants: 5 }],
    });

    const result = await joinSession({
      supabase: mockSupabase,
      sessionId: '1',
      userId: 'user-1',
      userName: 'Test User',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('session_full');
  });

  // Error: already joined
  it('should reject duplicate joins', async () => {
    // ... test implementation
  });

  // Edge case: curated session
  it('should set status to pending for curated sessions', async () => {
    // ... test implementation
  });
});
```

## Test Pattern: Every Test Has Three Parts

```typescript
it('should [expected behavior] when [condition]', async () => {
  // ARRANGE — set up the test data and mocks
  const input = { ... };

  // ACT — call the function
  const result = await functionUnderTest(input);

  // ASSERT — verify the result
  expect(result).toEqual(expected);
});
```

## Mocking Supabase

Create a reusable mock factory:

```typescript
// test-utils/mock-supabase.ts
export function createMockSupabase(data: Record<string, any[]>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: data[table]?.[0] || null, error: null }),
          maybeSingle: async () => ({ data: data[table]?.[0] || null, error: null }),
        }),
        in: () => ({
          data: data[table] || [],
          error: null,
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: 'new-id' }, error: null }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  };
}
```

## When This Skill Activates

When creating or modifying a file in `lib/`:
1. Check if a `.test.ts` file exists for it
2. If not, create one with tests for the happy path, main error case, and one edge case
3. If it exists, add tests for the new/changed functionality

When the test framework is not yet installed:
1. Create the test files anyway (they serve as documentation of expected behavior)
2. Add a comment at the top: `// Run with: npx vitest run`
3. Note to the user that `vitest` needs to be installed
