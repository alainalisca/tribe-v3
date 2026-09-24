# Tribe.OS Merge Gate

This checklist is **unchecked until the end**. Every item must be verified before the final merge into `main`.

Al's written instruction — the exact words **"merge tribe-os into main"** — is the only trigger.

---

## Pre-merge checklist

- [ ] All T-OS tickets (T-OS0, T-OS1, T-OS2, …) complete on `tribe-os/main`.
- [ ] `main` freshly merged INTO `tribe-os/main`; conflicts resolved.
- [ ] `tsc` passes with zero errors.
- [ ] `eslint` passes with zero errors.
- [ ] `vitest run` — all tests green.
- [ ] RLS probes recorded for every new table, RPC, and route:
  - [ ] Anon (no auth) — all denied.
  - [ ] Gym member (authenticated, belongs to the gym) — expected access.
  - [ ] Non-member (authenticated, does NOT belong to the gym) — all denied.
- [ ] BullBox pilot sign-off (Leo or Al confirms the feature works for BullBox's workflow).
- [ ] Every held Class B migration dry-run on a Supabase branch or local Postgres restored from a schema-only dump, with results recorded here or in the PR.
- [ ] Migrations renumbered from the 9000+ block into main's sequential numbering.
- [ ] Manual production backup taken; backup ID recorded below.
- [ ] Al's written instruction recorded below.

## Branch-only artifacts to remove before merge

These exist only for the `tribe-os/*` isolation and would break `main` if merged as-is:

- [ ] **`.husky/pre-push`** — blocks pushes to `main`. Must be removed or made inert (exit 0 unconditionally) before merge, or every future push to main will fail.
- [ ] **`predev` and `pretest` scripts in `package.json`** — call `os-guard.mjs` which fails on `main`. Must be removed before merge, or `npm run dev` and `npm test` will fail on main.
- [ ] **`scripts/os-guard.mjs` and `scripts/os-migration-check.mjs`** — review whether to keep (with a main-compatible mode) or remove.
- [ ] **`.githooks/pre-push`** — redundant copy of the hook (husky uses `.husky/pre-push`). Remove.

## Records

**Backup ID:** _(fill at merge time)_

**Al's merge instruction:** _(paste the exact message and date here)_

**Probe results:** _(link to PR or paste summary)_

**Class B dry-run results:** _(link or paste)_
