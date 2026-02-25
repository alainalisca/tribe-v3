---
name: code-quality-gate
description: "Enforces senior-engineer code quality standards on every file edit. Triggers whenever Claude creates, modifies, or refactors any .ts or .tsx file. Checks for: `any` types (must be replaced with proper types or have a justifying comment), empty catch blocks, files over 300 lines, inline database calls in components, missing error handling on async operations, hardcoded values that should be constants/env vars, and unused imports. This skill fires on EVERY code change — even small edits. If you're writing or modifying TypeScript/React code, use this skill."
---

# Code Quality Gate

This skill enforces senior-engineer standards on every file you create or modify. Run these checks BEFORE finalizing any `.ts` or `.tsx` file.

## Quality Checklist

After writing or modifying code, review the output against every item below. Fix violations before presenting the code to the user.

### 1. Type Safety
- No `any` types unless accompanied by a `// REASON: ...` comment explaining why it's unavoidable
- Function parameters have explicit types
- Return types are explicit on exported functions
- Props interfaces are defined (not inline `any`)
- Supabase query results are typed (use generated DB types from `lib/database.types.ts` if available)

**Example — BAD:**
```tsx
export default function MyComponent({ session, user, language }: any) {
```

**Example — GOOD:**
```tsx
interface MyComponentProps {
  session: Session;
  user: User | null;
  language: 'en' | 'es';
}
export default function MyComponent({ session, user, language }: MyComponentProps) {
```

### 2. Error Handling
- Every `try/catch` block either logs the error with context OR surfaces it to the user via toast/UI
- No empty `catch {}` blocks — at minimum: `catch (error) { console.error('Context:', error); }`
- The only exception: `navigator.share().catch(() => {})` where user-cancelled is expected
- Async functions that can fail should have error handling
- Error messages shown to users are human-friendly, never raw error objects

### 3. File Size
- No file should exceed 300 lines after your edit
- If a file is approaching 300 lines, extract logical sections into separate files:
  - UI sections → separate components
  - Data fetching → `lib/dal/` functions
  - Utility logic → `lib/` helpers
  - Types → `types/` or colocated `.types.ts`

### 4. No Inline Database Calls in Components
- Components (files in `components/` or `app/`) should NOT contain raw Supabase queries
- Database operations belong in `lib/dal/` (data access layer) files
- Components call DAL functions, not `supabase.from(...)` directly
- Exception: page-level `app/*/page.tsx` files may contain queries during migration, but new code should use DAL

### 5. No Debug Artifacts
- Remove all `console.log` statements (use `lib/logger.ts` for production logging)
- No `// TODO` without a linked issue or clear plan
- No commented-out code blocks
- No hardcoded URLs, tokens, or credentials

### 6. Import Hygiene
- No unused imports
- Imports are organized: external packages first, then internal modules, then relative imports
- No circular imports

### 7. Async Operation UX
- Every button that triggers an async operation has a loading/disabled state
- Loading states show visual feedback (spinner, "Loading..." text, disabled styling)
- Buttons use `disabled={isLoading}` to prevent double-clicks

## How to Apply

After writing code, mentally walk through each check. If you find a violation:

1. Fix it immediately — don't note it for later
2. If fixing it would significantly change the scope (e.g., extracting a 500-line file into components), inform the user and propose the extraction
3. If an `any` type is truly unavoidable, add the justifying comment

The goal is that every file Claude touches leaves in better shape than it was found.
