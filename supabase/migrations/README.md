# Migrations

Applied in **lexical filename order**. One migration per logical change;
never edit an applied migration — add a new higher-numbered one.

## Known historical number collisions (do NOT renumber)

Two number prefixes were used twice, very early, before the verifier
existed:

| #   | Files                                                           |
| --- | --------------------------------------------------------------- |
| 013 | `013_fix_social_rls_policies.sql`, `013_product_storefront.sql` |
| 014 | `014_referrals.sql`, `014_session_comments.sql`                 |

These were **all applied to production long ago**. They are
independent (an RLS-policy fix vs. the product storefront; referrals
vs. session comments) with no ordering dependency between the two
files sharing a number, and lexical order (`_fix_` < `_product_`,
`_referrals` < `_session`) is deterministic and stable.

**Renumbering them now would be actively harmful**: any state-tracking
that keys on filename would treat the renamed file as unapplied and
attempt to re-run an already-applied migration. Leave them as-is. This
note exists so the collision reads as _known and intentional-to-leave_
rather than a mistake to "fix".

## Verifier

`supabase/verify-migration-state.sql` checks the Tribe.OS-era
migrations (>= 060) are actually present in a given database.
`supabase/verify-migration-state.test.ts` fails CI if a migration
file >= 060 is added without a matching verifier check (or vice
versa). The < 060 range (including the collisions above) is out of
scope — applied before the verifier existed.
