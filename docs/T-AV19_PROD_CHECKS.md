# T-AV19 production checks

Conclusions only. The queries are read-only recon files in `supabase/recon/`;
their raw output is not reproduced here, and nothing below names a person, an
email or an account id.

## 1. admin_delete_user damage check

File: `supabase/recon/admin-delete-prod-readonly.sql`. Run in production on
2026-09-29.

**Background.** Until the emergency fix on 2026-09-27 (migration 196),
`anon` could execute `public.admin_delete_user`, a SECURITY DEFINER function
with no caller check. Anyone holding the public anon key could soft-delete any
user and hard-delete their messages, bookings and hosted sessions.

**Result.**

| measure                                                                     | value  |
| --------------------------------------------------------------------------- | ------ |
| accounts soft-deleted through `admin_delete_user`, 2026-04-20 to 2026-09-27 | 13     |
| of those, test accounts                                                     | 5      |
| self-service deletions (the anonymized fingerprint) in the same window      | 0      |
| deletions through `admin_delete_user` after the fix                         | 0      |
| `anon` can execute `admin_delete_user` now (row 403)                        | 0 (no) |

**Conclusion.** The database cannot tell an admin's deletion from an
attacker's, because both go through the same function and leave identical
rows. So the 13 were reviewed by hand. Al reviewed all 13 on 2026-09-29 and
confirmed every one was his own admin deletion. **No abuse found, no restore
needed.** The hole is closed in production.

## 2. Drift check

File: `supabase/recon/drift-2026-09-28-prod-readonly.sql`. Run in production
on 2026-09-29, for the rows of `supabase/verify-migration-state.sql` that did
not read `applied`.

**Conclusion: seven stale probes. Production is correct for every one.**

| row      | what production shows                                                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 077      | 0 co-attendance pairs to write, so an empty `training_partners` is correct                                                                |
| 093      | `users` is under per-column SELECT, with no table-level grant; `email`, `is_admin` and `location_lat` are not readable by `authenticated` |
| 108, 111 | the objects migration 136 dropped are gone; the surviving chat webhook is async, reads its secret from Vault, and holds no literal secret |
| 119      | the current `join_session` checks `join_policy` and `auth.uid()`                                                                          |
| 133      | the text the probe matched appears only in a comment; the code compares uuid to uuid                                                      |
| 142      | 26 accounts flagged as test accounts; 12 of the original 13 are still flagged, and the one that is not was decided as intentional         |

The probe fixes themselves belong on `main` (T-DRIFT2), not on this branch.
They landed there as #184 and #185. This branch changes no probe.

**GUARD_184 (the applied-migration mirror).** Production's
`migrations_applied` has 25 rows; `main`'s mirror lists 18. The 7 extra rows
are the Tribe.OS migrations 9000 to 9006, applied 2026-09-24 to 2026-09-26,
which exist only on `feat/t-os1-visits`.

**Open question for Al, not for this branch:** those seven are recorded in
production but not on `main`. That is the "applied but not merged" state
CLAUDE.md warns about. Whether they merge, and how the reserved 9000 block is
renumbered at the Tribe.OS merge gate, is a decision outside T-AV19.
