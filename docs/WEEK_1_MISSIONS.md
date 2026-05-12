# Week 1 Missions — Tribe.OS Gym-Tenant Integration

Goal: foundation for the gym-tenant architecture in place via additive
migration (Path B). Pre-launch tech debt cleared. All existing
functionality still works; new Tribe.OS work going forward sits on
gym-tenant scaffolding.

Branch: `feature/tribe-os`. No merge to main until integration is
complete and Al gives explicit ask.

## Mission status

| #   | Mission                                            | Status     | Commit / artifact                                                                               |
| --- | -------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| 1   | Pre-launch hardening (tech debt + security audit)  | ✅ done    | shipped under Week 4 Mission 1                                                                  |
| 2   | Gym-tenant additive schema migration               | ✅ done    | migration `068_gym_tenant_schema.sql`                                                           |
| 3   | Gym-tenant data backfill                           | ✅ written | migration `069_gym_tenant_backfill.sql`, **apply manually after Supabase backup**               |
| 4   | Dual-path RLS on tenant tables                     | ✅ written | migration `070_dual_path_rls.sql`                                                               |
| 5   | DAL updates for gym context                        | ✅ done    | `lib/dal/gyms.ts`, `lib/dal/gymCoaches.ts`, + updates to `tribeOSPremium`, `clients`, `revenue` |
| 6   | Onboarding + Stripe webhook + premium gate use gym | ✅ done    | checkout route + Stripe webhook + grant CLI                                                     |

## Apply order for migrations 068 → 070

Migrations 068, 069, 070 are written and committed to the repo but
not yet applied to the live database. Follow this order:

1. **Take a manual Supabase backup** via the Dashboard. Note the
   backup id and timestamp.
2. Apply `068_gym_tenant_schema.sql` via the Supabase SQL editor.
   Verify the `gyms` and `gym_coaches` tables exist and the `gym_id`
   columns are present on `clients`, `client_attendance`, `payments`.
3. Apply `069_gym_tenant_backfill.sql`. Then run the verification
   queries at the bottom of that file:
   - `SELECT COUNT(*) FROM public.gyms;` should equal the count of
     Tribe.OS users.
   - `SELECT COUNT(*) FROM public.clients WHERE gym_id IS NULL AND
instructor_user_id IN (SELECT owner_user_id FROM public.gyms);`
     should be 0.
   - Same shape for `client_attendance` and `payments`.
   - **Do NOT proceed to 070 if any verification query returns
     non-zero.**
4. Apply `070_dual_path_rls.sql`. RLS now accepts either legacy
   `instructor_user_id = auth.uid()` or gym membership for every
   tenant table.
5. Real-device verify: sign in as Al, load `/os/clients` and
   `/os/revenue`, confirm everything still works (legacy path).
6. Run the leak test (`node scripts/rls-leak-test.js`) and confirm
   11 PASS / 0 FAIL / 4 WARN (the 4 known WARNs are the payout/PII
   columns deferred in `LATER.md`).

## Deferred from Week 1 (see `LATER.md`)

- **Multi-coach revenue SQL functions** — Week 2. Today's
  `getRevenueSummaryForGym` works only for single-owner gyms because
  the underlying SQL function gates on `auth.uid() = p_user_id`.
- **Cleanup migration to drop legacy `instructor_user_id` RLS path** —
  Week 5+, after dual-path operation has been stable for some time.

## Verification checklist before declaring Week 1 done

- [ ] Migrations 068 / 069 / 070 applied to live DB
- [ ] `SELECT COUNT(*)` queries from 069 all return 0 (or expected)
- [ ] `/os/clients` loads as Al on iOS Capacitor build
- [ ] `/os/revenue` loads as Al on iOS Capacitor build
- [ ] `node scripts/rls-leak-test.js` passes (11 / 0 / 4)
- [ ] Grant CLI smoke test: re-grant an existing premium user, see
      both the user row AND the gym row updated; gym row reads
      correctly via `getGymForUser`
- [ ] Stripe webhook smoke test (optional but valuable): trigger a
      fake `customer.subscription.updated` event via Stripe CLI,
      confirm both `users.tribe_os_status` AND
      `gyms.tribe_os_status` update
