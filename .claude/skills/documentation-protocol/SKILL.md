---
name: documentation-protocol
description: "Ensures meaningful documentation is written for API routes, new pages, architecture decisions, and significant changes. Triggers when Claude creates a new API route, a new page, a new lib/ module, makes an architecture decision, or when the user mentions 'document', 'docs', 'README', 'CHANGELOG', 'JSDoc', or 'comments'. This is not about generating READMEs for everything — it's about writing the specific documentation that saves time when you come back to this code in 3 months."
---

# Documentation Protocol

Write documentation that saves future-you (and future-Claude) from re-reading entire files to understand what's happening.

## What to Document

### API Routes — JSDoc Block at Top

Every API route gets a header comment:

```typescript
/**
 * POST /api/notify-nearby
 * 
 * Sends push notifications to users within 10km of a live session.
 * Called by the go-live flow when a user starts training.
 * 
 * Auth: Required (user must be the session creator)
 * Input: { sessionId: string, location: { lat: number, lng: number } }
 * Output: { success: boolean, notified: number }
 * Errors: 401 (unauthorized), 404 (session not found), 500 (notification failure)
 */
export async function POST(request: NextRequest) {
```

### New Pages — Purpose Comment

Every new page gets a one-line purpose and its dependencies:

```typescript
/**
 * /sessions — Lists user's upcoming and past sessions.
 * Uses: lib/dal/sessions.ts, components/SessionCard.tsx
 * Header: Fixed title + tabs (uses dynamic measurement pattern)
 */
export default function SessionsPage() {
```

### Architecture Decisions — ADR in Comments

When making a non-obvious technical choice, document why:

```typescript
// ADR: Using inline ternaries for i18n instead of a translation library.
// Reason: The app has ~200 strings. A full i18n library (next-intl, react-i18next)
// adds bundle size and complexity that isn't justified at this scale.
// If we exceed 500 strings, migrate to next-intl.
```

### Complex Logic — Inline Comments

When the code does something non-obvious:

```typescript
// Optimistic count: we check confirmedCount + 1 against max_participants
// BEFORE inserting, to avoid a race condition where two users join simultaneously
// and both pass the check. The UNIQUE constraint on (session_id, user_id) prevents
// actual duplicates, but the count could be off by 1 temporarily.
const confirmedCount = confirmedParticipants?.length || 0;
if (confirmedCount + 1 > session.max_participants) {
```

### CHANGELOG — User-Facing Changes

When a change affects what users see or do, add to CHANGELOG.md:

```markdown
## [2.2.1] - 2026-02-26

### Fixed
- Session page spacing no longer clips content behind header
- Join button properly prevents double-taps

### Added
- Skill level filter on session creation
```

## What NOT to Document

- **Obvious code** — `const name = user.name; // gets the user's name` adds nothing
- **Every function** — only exported functions and non-obvious ones need JSDoc
- **Commit messages** — those go in git, not in code comments
- **Temporary notes** — use `// TODO:` with a plan, not `// fix later`

## Rules

1. **Document "why", not "what"** — the code shows what. Comments explain why.
2. **API routes always get JSDoc** — auth, input, output, errors. Non-negotiable.
3. **ADRs live near the code** — not in a separate folder nobody reads. Inline comments or a section at the top of the file.
4. **CHANGELOG is user-facing** — write it in plain language. "Fixed join button" not "Resolved race condition in session_participants insert."
5. **Keep docs current** — stale docs are worse than no docs. When changing code, update its comments.
6. **New lib/ modules get a top-of-file comment** — what this module does, who calls it, and any important constraints.
