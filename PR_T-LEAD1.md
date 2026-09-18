## T-LEAD1: digital pass with lead capture

Printed vouchers get thrown away. This is the digital version: a person scans a QR, leaves name, WhatsApp and email at `/pase/bullbox`, and the partner has the lead in their inbox the same minute, whether or not that person ever creates a Tribe account.

Route is `/pase/{slug}`. Adding a second partner, or an instructor, is a data change and not a code change: instructors get a `featured_partners` row with `business_type = 'independent'`, which two of the three live partners already are, so there is one resolver and one table.

Web only. No Capacitor plugin, no native change, no store resubmission, no new npm dependencies.

### What shipped, per commit

**`892cba8` Migration 172: pass fields on featured_partners, lead routing in its own table.** Adds `pass_headline`, `pass_sub`, `pass_options`, `pass_active` and `lead_whatsapp` to `featured_partners`, and creates `partner_lead_routing` for the secret half. Seeds BullBox with headline, sub and options, `pass_active` false.

**`3dc3925` Migration 173: pass_leads.** The leads themselves, plus `pass_is_active()`.

**`3226f5c` Fix the migration verifier.** Unrelated to the feature, and explained below.

**`0aac943` POST /api/pase.** Validation, normalisation, pass code generation, two emails, rate limit, honeypot, time on page.

**`a02c087` The pass page, the consent policy stub, and the routes that reach them.** `/pase/[slug]`, `/legal/tratamiento-de-datos`, and the three route registrations.

**`8a0f438` Add the T-LEAD1 recon script.** The read only probe the migrations were written against.

**`c784935`** Punctuation sweep, comments only.

### The design change on 172, and why

The plan was to put `lead_email` and `lead_cc` on `featured_partners` and keep them out of `partners_public`. That would not have made them private, and it is worth being precise about why, because the reasoning generalises.

`anon` holds table level SELECT on `featured_partners`, and the only SELECT policy on it is `status = 'active' OR is_app_admin()`. Probed with the live anon key rather than reasoned about:

```
GET /rest/v1/featured_partners
    ?select=slug,monthly_fee_cents,tier,status,expires_at,user_id&slug=eq.bullbox
-> 200 [{"slug":"bullbox","monthly_fee_cents":0,"tier":"standard",
         "status":"active","expires_at":"2027-03-10T13:18:53Z",
         "user_id":"0df617e9-7547-4a8d-a0b1-8be4d52a673a"}]
```

Every one of those columns is on migration 163's "deliberately excluded, and they must stay excluded" list for `partners_public`. The view excludes them and the base table hands them over. A `lead_email` column there would have been readable by anyone holding the anon key, which ships in the client bundle.

The first fix was to revoke table level SELECT and grant every column back except the secret ones. It was written, rehearsed and thrown away. It works, but it leaves a trap: from then on every migration adding a column to `featured_partners` must remember a GRANT, and one that forgets makes the column invisible to every client with `42501`. That is exactly the 156-on-`public.users` failure that broke onboarding three attempts running. A fix whose ongoing cost is "remember this forever" is not a fix.

So the secret moved to `partner_lead_routing`, a table `anon` was never granted anything on. RLS on, zero policies, `REVOKE ALL` from `anon`, `authenticated` and `PUBLIC`, `service_role` the only reader. Default deny by construction rather than by a grant list someone has to maintain. **This migration changes no grant on `featured_partners`,** and a guard fails it if a future edit tries to.

The REVOKE is load bearing rather than defensive boilerplate. Supabase ships default privileges granting ALL on new public tables to `anon` and `authenticated`, so without it the table is born with `anon` holding SELECT, INSERT, UPDATE and DELETE on the partner's inbox. Confirmed by creating a bare table in the fixture without one and finding `has_table_privilege('anon', ..., 'SELECT')` true.

Two smaller corrections to 163's header while we were in there. Its claim that the table has no column level grant regime is stale: `auto_approve_roster` and `display_order` both carry ACLs. And the live SELECT policy's name matches no name in any migration file, so a future `DROP POLICY IF EXISTS` written from the files would silently no-op and look like it worked.

### 173 and the lapsed sponsorship

`pass_leads` gives `anon` INSERT and no SELECT, so the anon key can file a lead and never read one. The INSERT policy is migration 056's shape without its `WITH CHECK (true)`, which on a table holding a stranger's phone number would be an open mailbox.

Whether the pass is live is asked through `pass_is_active()`, a SECURITY DEFINER function, not an inline `EXISTS`. A subquery inside a policy runs as the calling role and is subject to RLS on what it reads, so the inline version was also asking "can the caller see the partner row". Since `featured_partners`' SELECT policy is `status = 'active'`, a partner whose sponsorship lapsed with `pass_active` still true would have had every submission refused by a policy, with nothing saying why. Migration 163 went to some trouble so a gym's bio link survives a lapsed sponsorship; the pass has to survive it too. Rehearsed both ways: inline refuses the expired case, the function accepts it.

Updates are admin only. The partner's "Contactado" toggle needs a row and column scoped write, which has no policy form, so it goes in a SECURITY DEFINER function when phase 2 ships rather than an owner UPDATE policy. That is migration 018's mistake on this table family, which 104 had to undo.

### Rehearsal results, run against production and rolled back

Migration 172, eight of eight:

```
check_name                                  | actual | expected | pass
--------------------------------------------+--------+----------+-----
1_pass_columns_added                        | 5      | 5        | t
2_routing_table_rls_enabled                 | true   | true     | t
3_routing_table_has_no_policies             | 0      | 0        | t
4_routing_table_unreachable_by_client_roles | none   | none     | t
5_service_role_reads_routing_table          | true   | true     | t
6_featured_partners_grants_untouched        | true   | true     | t
7_bullbox_seeded_and_inactive               | 1      | 1        | t
8_no_pass_column_in_partners_public         | none   | none     | t
```

Migration 173, nine of nine:

```
check_name                                | actual                         | expected                       | pass
------------------------------------------+--------------------------------+--------------------------------+-----
1_table_created_with_rls                  | true                           | true                           | t
2_anon_can_file_a_lead                    | true                           | true                           | t
3_anon_can_never_read_a_lead              | false                          | false                          | t
4_client_roles_cannot_modify_leads        | none                           | none                           | t
5_three_policies                          | 3                              | 3                              | t
6_pass_is_active_is_security_definer      | true                           | true                           | t
7_pass_is_active_search_path_pinned       | search_path=public, pg_catalog | search_path=public, pg_catalog | t
8_no_policy_reads_users_is_admin_directly | none                           | none                           | t
9_service_role_can_write                  | true                           | true                           | t
```

173's policy calls a function that reads a column 172 adds, so 173 cannot rehearse alone against a database without 172. It was run with 172's body ahead of it in the same transaction, and the rehearsal header records how to reproduce that.

Both rehearsals are `BEGIN`, body verbatim, pass/fail table, `ROLLBACK`. Verified afterwards that production still had no `pass_leads`, no `partner_lead_routing`, no `pass_is_active` and 30 columns on `featured_partners`.

Every guard in both migrations was mutation tested rather than assumed. Restoring the table grant, dropping one column from a re-grant, adding a policy to the routing table, taking `lead_email` from `service_role`, reverting the seed and leaking a pass column into `partners_public` each make the intended guard fire with the intended message.

### The route

Modelled on `/api/tribe-os-waitlist`, the repo's other unauthenticated form. Service role client, `checkRateLimit(admin, 'pase:{ip}', 5, 600_000)`, honeypot field, two second minimum time on page, `Promise.allSettled` on both sends.

The row is the product, not the email. The insert happens first and `notified_at` is written only when the partner send resolved, so a Resend outage costs a notification and never a lead. A NULL `notified_at` beside a real row is the flag that someone has to chase it by hand. The lead's own copy failing does not clear that flag, because it is a courtesy rather than the notification the column is about.

One lookup, one answer. `fetchPassConfig` joins `featured_partners` to `partner_lead_routing` with `!inner`, so a partner with `pass_active` true and no routing row is simply not servable. No such partner, pass switched off, and not configured yet all return the same 404 with the same body: telling them apart lets anyone enumerate which partners exist and which are configured.

The consent sentence is a server side constant and never echoed from the request body. A client that supplies its own chooses what it appears to have agreed to, which makes the stored consent worthless as the evidence it exists to be. It is stored verbatim on the row with a timestamp.

`src` and `code` are dropped to null when malformed, never rejected. They are attribution off a printed QR, and losing a real lead because a poster had a typo in its query string is the wrong trade every time.

`BB` is not derivable from the slug `bullbox`, which gives `BU`. It is the brand's own initials, and 163 lowercased away the capital B that showed the word boundary, so it is one entry in a small override map with the slug as the default. Getting it wrong is cosmetic. A column would make a new partner unservable until someone filled it in.

Failures log the `pass_lead` id and never the payload, because the row is a stranger's phone number and email and log lines outlive the retention we promised them.

### The page

`/pase/[slug]` is a server component reading through the same `fetchPassConfig` the route uses. If the page and the API each decided what "servable" meant, the obvious failure is a form that renders and then refuses every submission.

Unservable renders a real page rather than a 404, because a 404 on a URL printed on a paper voucher reads as "Tribe is down" to someone standing in the gym holding it. It never says which of the three conditions failed.

The honeypot is positioned offscreen rather than `display:none`, because the naive bots it is aimed at skip fields they cannot see. `tabindex -1` and `aria-hidden` keep it away from keyboard and screen reader users.

Success persists in `sessionStorage`, keyed by slug. Without it a refresh shows an empty form, the person assumes the first attempt failed and fills it in again, and the partner gets two leads to untangle. Every read and write is wrapped, because private mode and blocked site data both throw.

Green is a fill behind `tribe-dark` text and a border, never text and never a page background. Nothing in the palette clears AA as small green copy on a light surface.

`/legal/tratamiento-de-datos` is a stub with the text pending and `noindex` until it lands. The consent checkbox links there and never to `/legal/privacy`: that page is a general privacy policy, this one is the Ley 1581 de 2012 authorisation for handing a person's details to a third party. Pointing a data transfer consent at a policy that does not describe the transfer is worse than a dead link, because it looks answered.

### Testing

1912 tests green, `npm run build` clean, `tsc --noEmit` clean, eslint clean on every new file.

36 tests for this feature: phone normalisation, pass code generation, and 20 on the route. The ones that matter were mutation tested. Making an email failure a 500, stamping `notified_at` unconditionally, echoing `consent_text` from the client, and removing either bot check each turn the suite red.

Verified against a real `next start`: `/pase/bullbox/` returns 200 unauthenticated with no redirect to `/auth`, carries `noindex`, and contains no install prompt or feedback widget markup.

### Follow ups for T-SEC3

None of these are introduced by this PR and none are fixed by it.

1. `anon` can read `monthly_fee_cents`, `tier`, `expires_at` and `user_id` off `featured_partners` directly, despite `partners_public` being written to exclude exactly those. The view is not the boundary anyone assumes it is.
2. The live SELECT policy on `featured_partners` is named `Anyone can read active or admin reads all`, which appears in no migration file. A replacement written from the files would `DROP POLICY IF EXISTS` a name that does not exist, no-op silently, and look like it worked. This is the same shape as the fifth policy that defeated migration 159.
3. Migration 163's header records that `featured_partners` has no column level grant regime. It is stale: `auto_approve_roster` and `display_order` both carry column ACLs.
4. `authenticated` holds table level UPDATE on `featured_partners`. The only thing preventing any logged in user rewriting any partner's row is that migration 104 dropped the owner UPDATE policy and never replaced it. That is a policy absence rather than a grant, which is a fragile thing to depend on.

### Follow up for a new ticket, T-DRIFT2

`supabase/verify-migration-state.sql` had not parsed since migration 169 was added with an unterminated `CASE`: two `then` arms, no `else ... end`, and no `union all` after it. Every branch from 170 onward was unreachable, so the script that answers "which migrations are actually applied in production" answered nothing at all. It went unnoticed because the only test asserted that each migration id appears in the file as a string, which answers "is this mentioned" rather than "does this run". The test file even carried a comment explaining that the structural check had been dropped because a truly broken row "would fail at the SQL editor on first invocation anyway", which is what happened, silently, for as long as nobody pasted it in.

Fixed here because this PR adds branches to that file and could not otherwise verify its own. The replacement test keys on the invariant the bug violated: N branches joined by exactly N-1 `union all`. Reintroducing the original bug now fails the suite.

With it running again, it reports seven migrations as MISSING on production that the parse failure had been hiding:

```
077_backfill_training_partners                MISSING or empty gym
093_restore_users_select_grant                MISSING
108_fix_join_notify_triggers_session_title    MISSING
111_async_http_and_externalize_secrets        MISSING
119_join_session_enforce_policy_and_owner     MISSING
133_rls_h2_gate2_invite_notification_rpc_fix  MISSING
142_flag_founder_test_accounts                MISSING
```

These have not been investigated. Some may be false positives from a check written against an artifact that later changed, and some may be genuinely unapplied migrations sitting in production. Either way it is not T-LEAD1's to judge, and it wants its own ticket.

### Disclosure

During investigation I sent an unwrapped anon `PATCH` at CrossFit BullBox's live `featured_partners` row to test whether writes were blocked. They were: RLS refused it, `phone` is still null and `updated_at` is unchanged from 2026-09-10. PostgREST returns 204 for zero rows affected, which is why it initially looked like it had succeeded.

It was still a production write probe against a real gym's record, which CLAUDE.md forbids outright and the migration protocol says to wrap in a transaction. It was a no-op by luck of RLS rather than by method. Recording it because the same class of probe put six invented classes on BullBox's public page during T-GYM2, and a near miss that goes unrecorded is how the next one stops being a near miss.

### Not in this PR

The partner leads dashboard (phase 2, needs the `/partners` dashboard to exist) and the Monday weekly digest. The cron mechanism exists in `vercel.json` if the digest is wanted later; note that Vercel crons run in UTC, so 07:00 America/Bogota is `0 12 * * 1`.

`lead_email`, `lead_cc` and `lead_whatsapp` are set by hand once the partner sends them, and `pass_active` is flipped by hand at the same time.
