---
name: session-briefing
description: "Provides a fast context-loading briefing at the start of every coding session. Triggers when Claude starts a new conversation about a project, when the user says 'let's start', 'where were we', 'what's next', 'continue', 'pick up where we left off', or any indication of starting a new work session. Reads recent commits, checks build status, and presents a 30-second status report so no time is wasted on context recovery."
---

# Session Briefing Protocol

At the start of every coding session, run this briefing before doing anything else. The goal: the user is productive within 60 seconds.

## Briefing Steps

### 1. Check Project State

```bash
# Recent activity
git log --oneline -10

# Current branch and status
git status

# Build health
npm run build 2>&1 | tail -5

# Any uncommitted changes?
git diff --stat
```

### 2. Read Project Context

- Read `CLAUDE.md` for project rules and current priorities
- Read `engineering-standards.md` for quality standards
- Read `CONVENTIONS.md` for UI/spacing conventions
- Check for any `// TODO` or `// FIXME` in recently changed files

### 3. Present the Briefing

Format the briefing concisely:

```
📋 SESSION BRIEFING

Last session: [date of most recent commit]
Recent commits:
- [commit 1 summary]
- [commit 2 summary]
- [commit 3 summary]

Build status: ✅ Passing / ❌ Failing (details)
Uncommitted changes: None / [list files]

Current priorities (from CLAUDE.md):
1. [priority 1]
2. [priority 2]

Known issues:
- [any TODOs or known bugs]

Ready to go. What are we working on?
```

### 4. Standards Reminder

Briefly remind yourself (not the user) of the active standards:
- All new code follows engineering-standards.md
- UI follows CONVENTIONS.md spacing patterns
- No `any` types, no inline DB calls, no empty catch blocks
- Files under 300 lines

## When NOT to Brief

- If the user immediately gives a specific task ("fix this bug"), do the briefing silently (read the files, check the state) but don't present it — jump into the task
- If the user says "skip the briefing" or similar, skip it
- If this is a continuation of an active conversation (not a new session), skip it
