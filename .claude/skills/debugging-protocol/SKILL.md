---
name: debugging-protocol
description: "Enforces a systematic debugging workflow that prevents recurring bugs and misdiagnosed root causes. Triggers whenever Claude encounters a bug report, error, broken functionality, or when the user says 'fix', 'broken', 'not working', 'bug', 'issue', 'wrong', 'crash', or describes unexpected behavior. Never jump straight to a fix — diagnose first, then fix all instances, then verify. Use this skill for every bug fix, no matter how small."
---

# Structured Debugging Protocol

Never guess at fixes. Diagnose, then fix, then verify, then prevent recurrence.

## Step 1: Reproduce and Understand

Before touching any code:

1. **Clarify the symptom** — What exactly is happening? What should happen instead?
2. **Identify the trigger** — What action causes the bug? Can you reproduce it?
3. **Locate the code path** — Trace from the user action to the code that executes. Which files, which functions, which line?
4. **Read the relevant code** — Don't assume you know what it does. Read it.

## Step 2: Diagnose Root Cause

Ask these questions in order:

1. **Is it a data problem?** — Wrong data from the database, missing fields, null where unexpected?
2. **Is it a logic problem?** — Conditional that evaluates wrong, missing check, wrong order of operations?
3. **Is it a timing problem?** — Race condition, stale state, effect running at wrong time?
4. **Is it a UI/CSS problem?** — Layout issue, overflow, z-index, missing styles?
5. **Is it a platform problem?** — Works on web but not iOS? Works in dev but not production?

State the root cause explicitly: "The bug is caused by [X] because [Y]."

## Step 3: Check for the Same Pattern Elsewhere

This is the step most developers skip. Before fixing:

1. **Search the codebase** for the same pattern — `grep -rn "the_problematic_pattern"` across all files
2. **List every instance** of the same bug class
3. **Fix all instances**, not just the reported one

Example: If header clipping is caused by hardcoded padding on one page, check ALL pages for hardcoded padding.

## Step 4: Implement the Fix

1. Fix the root cause, not the symptom
2. If the fix is more than a few lines, explain the approach to the user before implementing
3. Follow all code quality standards (types, error handling, etc.)

## Step 5: Verify

1. **Build passes** — `npm run build` with no errors
2. **The specific bug is fixed** — the symptom no longer occurs
3. **No regressions** — related functionality still works
4. **Edge cases considered** — what happens with empty data, null user, network failure?

## Step 6: Document and Prevent

1. If the bug was caused by a pattern violation, check if CONVENTIONS.md or engineering-standards.md covers it. If not, add it.
2. Commit message should explain what caused the bug and why the fix prevents recurrence.

## Anti-Patterns to Avoid

- **Shotgun debugging** — Changing multiple things at once hoping something works. Change one thing, test, repeat.
- **Symptom fixing** — Adding padding to hide clipping instead of fixing the measurement. Always fix the cause.
- **Incomplete fixes** — Fixing the reported instance but leaving identical bugs on other pages.
- **Untested fixes** — Committing without building and verifying.

## 20-Minute Rule

If you haven't identified the root cause within 20 minutes, stop and reassess:
- Are you looking at the right code path?
- Do you need more information from the user?
- Should you add logging to gather more data?
- Is this actually multiple bugs, not one?
