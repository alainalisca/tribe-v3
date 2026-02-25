---
name: pre-commit-audit
description: "Final quality check before every git commit. Triggers whenever Claude is about to run `git commit`, `git add`, or when the user says 'commit', 'push', 'ship it', 'deploy', or 'we're done'. Reviews all staged changes against the quality checklist and fixes violations before committing. This is the last line of defense — nothing ships without passing this audit."
---

# Pre-Commit Audit

Before every commit, review ALL staged/changed files against this checklist. Fix violations before committing.

## Audit Steps

### Step 1: Scan for Blockers

Run these checks mentally against every changed file:

**Hard blockers (fix immediately):**
- [ ] No `console.log` statements (use `lib/logger.ts` for production logging)
- [ ] No hardcoded API keys, tokens, secrets, or passwords
- [ ] No hardcoded `localhost` URLs without env var fallback
- [ ] No `any` types without a `// REASON:` comment
- [ ] No empty `catch {}` blocks without justification
- [ ] No `.select('*')` in Supabase queries — specify columns

**Soft blockers (fix if quick, otherwise note for user):**
- [ ] Files under 300 lines
- [ ] All user-facing strings have both EN and ES translations
- [ ] Async buttons have loading/disabled states
- [ ] Error messages are user-friendly (not raw error objects)

### Step 2: Verify Build

Always run `npm run build` before committing. If the build fails, fix the errors first. Never commit code that doesn't build.

### Step 3: Write a Good Commit Message

Follow conventional commits format:

```
type(scope): concise description

Types:
- fix:      Bug fix
- feat:     New feature
- refactor: Code restructuring (no behavior change)
- docs:     Documentation only
- style:    Formatting (no logic change)
- perf:     Performance improvement
- security: Security fix
- chore:    Build/tooling changes
```

**Example — BAD:**
```
fixed stuff
```

**Example — GOOD:**
```
fix: unify join logic into lib/sessions.ts — enforces capacity, policy, and curated checks from all entry points
```

The commit message should tell a future reader *what* changed and *why* without reading the diff.

### Step 4: Verify Scope

The commit should be focused on one logical change. If you've made unrelated changes, split them into separate commits. A commit that "fixes join logic AND updates header spacing AND removes dead files" should be 3 commits.

## What to Report

After completing the audit, tell the user:
1. Number of files changed
2. Any violations found and fixed
3. Any violations noted but not fixed (with reason)
4. The commit message you'll use
