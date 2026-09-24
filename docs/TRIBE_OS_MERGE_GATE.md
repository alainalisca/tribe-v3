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

## Records

**Backup ID:** _(fill at merge time)_

**Al's merge instruction:** _(paste the exact message and date here)_

**Probe results:** _(link to PR or paste summary)_

**Class B dry-run results:** _(link or paste)_
