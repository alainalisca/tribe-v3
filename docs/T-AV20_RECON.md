# T-AV20 Recon: Tribe Athletes, design lock

Spec: `Claude_Code_T-AV20_Tribe_Athletes_Spec.md`, section 6, T-AV20 steps 1 to 6.
Run 2026-09-26 on branch `feat/t-av20-recon`, cut from `athlete/main` at `1a2162e7`.

Read only. No migration, no app code, no seed run, no production access. Every
database answer below comes from the LOCAL stack, read inside `BEGIN READ ONLY`
transactions, or from the production schema dump `supabase/av-local-schema.sql`
(gitignored, pulled by Al 2026-09-26). Section 2.1 explains why those two
sources disagree and which one to believe for which question.

---

## 0. Headline findings (read these first)

| #   | finding                                                                                                                                                                                                                                                                                                           | hits                      | severity |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------- |
| F1  | **The local stack's GRANTS are not production's.** Locally `anon` holds `ALL` on 97 of 97 public tables and can SELECT `users.email`. The production dump grants anon less than `ALL` on 16 of them, including `pass_leads`, `users`, `sessions`. Any "denied by grant" probe run locally on those 16 is invalid. | T-AV21, T-AV22 probes     | HIGH     |
| F2  | **Adding columns to `pass_leads` makes them writable by anon through PostgREST.** Production grants anon table-level INSERT, and the INSERT policy only pins `notified_at`, `contacted_at`, `tribe_user_id`. A forged row with `referred_by_athlete_id` or `attended_at` preset passes.                           | T-AV21, T-AV22            | HIGH     |
| F3  | **The spec's migration header fails `av-migration-check`.** The check needs a bare `-- PROGRAM: T-AV` line, one `-- TABLE: <t> OWNER: consumer\|tribe-os\|t-av-new` line per table, and a probe in `verify-migration-state.sql`.                                                                                  | every 82xx file           | blocks   |
| F4  | **`tribe_user_id` is never written by any code.** The spec (and the parent spec section 7) say "as today". The claim POST is anonymous by design. Rules 3 and 4 matched "by `tribe_user_id`" have nothing to match against.                                                                                       | T-AV23 rules 3, 4         | design   |
| F5  | **`users` has no WhatsApp or phone column.** Rule 4 ("WhatsApp matches the referring athlete") has no athlete number to compare with.                                                                                                                                                                             | T-AV23 rule 4             | design   |
| F6  | **Coaches cannot read `pass_leads`.** SELECT is owner or admin only. The verify page (guest first name, claim date) and the door list need definer READ functions, and the spec lists none.                                                                                                                       | T-AV21, T-AV22, T-AV25    | gap      |
| F7  | **No QR renderer exists in the app bundle, and the CSP blocks the CDN one.** The voucher QR is also assigned to no ticket.                                                                                                                                                                                        | T-AV23/24/25, needs Al OK | decision |
| F8  | **"Log mode" is not implemented in any send path.** `PUSH_MODE` and `EMAIL_MODE` are read only by `scripts/av-guard.mjs`. Emails are safe locally today only because `.env.av.local` has no `RESEND_API_KEY`.                                                                                                     | T-AV27, parent            | gap      |
| F9  | **The spec points the seed at `scripts/seed-bullbox.sql`, which is the hand-run PRODUCTION seed for the real BullBox.** It must not be touched (CLAUDE.md, the real-gym rule). The local seed is `scripts/av-seed-local.mjs`.                                                                                     | T-AV22 seed               | HIGH     |
| F10 | **The local seed cannot serve a pass.** No `partner_lead_routing` row, so `/pase/bullbox-prueba` renders the inactive page. No admin user either.                                                                                                                                                                 | T-AV22 to T-AV27 tests    | gap      |

The 8200 to 8249 block is free everywhere (step 4, section 4).

---

## 1. Step 1: guard, branch, commits, migrations

```
$ npm run av:guard
av-guard OK: branch=athlete/main migrations=0 db=local push=log email=log  [url:.env.av.local push:.env.av.local email:.env.av.local]
```

- Branch `athlete/main` confirmed before cutting `feat/t-av20-recon`.
- T-AV0 commits present: `fab80c67`, `0e7c3f21`, `15778e80`, `9599ccc9`, `a20ab0ac`. T-AV1: `1a2162e7`.
- No 8000+ migrations exist on `athlete/main` (`migrations=0`, `ls supabase/migrations | grep ^8` empty).
- `athlete/main` highest numbered migration: 192. `origin/main` (`7575e74e`): 193. Unchanged from T-AV1's reading.

---

## 2. Step 2: the code, file by file

### 2.1 Local stack fidelity (F1)

T-AV1 states the local stack "carries production's exact schema, so policies,
grants, triggers ... are production's". **For grants that is not true.**

Measured locally (read-only), `has_table_privilege` / `has_column_privilege`:

| check                                      | local | production dump                                         |
| ------------------------------------------ | ----- | ------------------------------------------------------- |
| anon UPDATE on `pass_leads`                | yes   | no (`GRANT INSERT ... TO anon` only, dump line 11659)   |
| authenticated UPDATE on `pass_leads`       | yes   | no (`GRANT SELECT,INSERT ... TO authenticated`, 11660)  |
| anon SELECT on `users.email`               | yes   | no (T-SEC5 column regime, `users` SELECT is per column) |
| tables where anon holds table-level UPDATE | 97/97 | not measured as a count; see below                      |

Not every difference is a difference in UPDATE. Production grants
`authenticated` table-level UPDATE on `users` (dump 11216) and anon UPDATE on
`invite_tokens`, `reviews` and `session_participants`; what differs there is
SELECT or TRUNCATE. The honest statement is narrower: **on 16 tables the dump
grants anon something less than `ALL`, and locally anon holds `ALL` on every
one of them.**

The 16 tables: `client_imports`,
`client_retention_v2`, `client_visits`, `communities`, `gym_import_mappings`,
`invite_tokens`, `lead_credits`, `migrations_applied`, `one_off_sends`,
`partner_lead_routing`, `pass_leads`, `reviews`, `session_attendance`,
`session_participants`, `sessions`, `users`.

Mechanism, stated as a hypothesis rather than measured: the local Supabase
image applies its default privileges (`GRANT ALL` to `anon` and
`authenticated` on new public tables) when the dump's `CREATE TABLE` runs, and
the dump's `GRANT` lines are additive. It has 41 `REVOKE`s, none of which
removes that default. Production's narrower grants therefore never land.

Consequences:

- **T-AV1's S1 and S3 still stand.** The dump grants `ALL` to both roles on
  `challenge_participants` (10879-10880) and `notifications` (11189-11190), so
  those two tables are faithful locally.
- **T-AV21 acceptance 5** ("direct UPDATE as authenticated refused by RLS or
  grants") would pass locally for the WRONG reason. With no UPDATE policy the
  write returns `UPDATE 0` (the `USING` outcome in CLAUDE.md's table) while
  production would return `42501`. The same assertion can pass in both and
  prove different things.
- **T-AV22's probe matrix** ("every cell a real JWT result") is invalid for any
  cell whose denial comes from a grant, on any of the 16 tables.
- The fix is a T-AV0 follow-up, not part of this ticket: after `db reset`,
  `REVOKE ALL` from `anon, authenticated` on every public table and re-apply
  the dump's `GRANT` lines. Then re-measure this table, and add a check that
  compares each role's privileges per table against the dump, rather than
  trusting a count.

### 2.2 `app/pase/[slug]/` (page, form, confirmation)

`app/pase/[slug]/page.tsx` (283 lines). **A server component, not `'use client'`**
(CLAUDE.md's "all pages use client" does not hold here).

- `:28-33` `getConfig`: slug regex `^[a-z0-9-]{1,80}$`, then `fetchPassConfig`
  with the service-role client, wrapped in React `cache`.
- `:219-241` `InactivePass`: one page for three unservable states, never 404.
- `:243-283` the page. Reads `params` only; **it does not read `searchParams`**.
  Renders `PartnerHero`, headline, `PaseForm` (`:266-272`) with
  `consentTextFor(partnerName)`, and a Tribe credit footer.
- Spanish only. There is no language switch on this route.

`app/pase/[slug]/PaseForm.tsx` (443 lines, `'use client'`).

- `:86-93` reads `src` and `code` from `window.location.search` on mount and
  sends them as typed. **Attribution is client-read today**; the server page
  never sees the query string. T-AV23's server-rendered chip needs the page to
  accept `searchParams`.
- `:96-153` prefill for signed-in members. The comment is explicit: **"THE FORM
  STAYS ANONYMOUS ... the claim is still an unauthenticated POST, the row still
  has no user id on it"**. This is why `tribe_user_id` is never set (F4).
- `:175-254` submit to `/api/pase/` with name, whatsapp, email, choices, `src`,
  `code`, consent, honeypot, time-on-page.
- `:256-285` the confirmation ("Tu pase") is the form replacing itself in place:
  pass code in large type, WhatsApp link, storefront link, "sent to your email".
  **No QR.** Persisted in `sessionStorage` keyed by slug (`:43-67`).
- `:382-400` consent checkbox, the server-supplied text, and the policy link.

`app/pase/page.tsx` is the T-AV0 placeholder catalog, gated by
`requireAthleteValuePage()` (`lib/features/athleteValueServer.ts:43`).

### 2.3 `app/api/pase/route.ts` (272 lines)

- `:49-54` **`sanitizeTag`**: non-string, empty, longer than `MAX_CODE_LEN` (40,
  `:34`), or not `^[A-Za-z0-9_-]+$` becomes `null`. Never rejects. A `ref_code`
  of shape `^[A-Z0-9-]{4,24}$` passes unchanged, as the spec requires.
- `:118-122` **`buildStorefrontUrl`**: `/storefront/{owner}/?src=pase&code={code ?? slug}`.
  Note: with an athlete link, `code` is the athlete's `ref_code`, so the
  storefront link carries it forward. Harmless, but T-AV23 should decide
  whether that is wanted.
- `:170-171` `src` and `code` sanitized. `:174` consent text is a server constant.
- `:176-202` **the insert**: up to 5 attempts, a fresh `pass_code` each time,
  retry only on `duplicate_code` (23505). Row: slug, partner_id, name, whatsapp,
  email, choices, src, code, pass_code, consent_text, user_agent. **No
  `tribe_user_id`, and the route never reads the session.**
- `:216-262` emails via `Promise.allSettled`; `notified_at` stamped only if the
  partner send resolved.
- `:264-267` response: `pass_code`, `whatsapp_url`, `storefront_url`.

Supporting modules:

- `lib/pase/consent.ts`: `CONSENT_TEXT_V1` (Spanish, names BullBox),
  `consentTextFor()` swaps the partner name. **`pass_leads_consent_text` CHECK
  caps it at 500 characters** (migration 173 `:57`); the extra T-AV23 line must
  fit, in both languages.
- `lib/pase/passCode.ts`: codes are `{2 letters}-{4 of ABCDEFGHJKLMNPQRSTUVWXYZ23456789}`,
  CHECK `^[A-Z]{2}-[A-Z2-9]{4}$` (173 `:58`). `bullbox` maps to `BB`;
  **`bullbox-prueba` falls through to `BU`**. The prototype's `TRB-3100` shape
  would violate the CHECK.

### 2.4 `lib/dal/` functions touching `pass_leads` and `featured_partners`

`pass_leads`:

| file:line                     | function                                             | client       | does                                                                                                    |
| ----------------------------- | ---------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `lib/dal/passLeads.ts:64`     | `fetchPassConfig`                                    | service role | partner + `partner_lead_routing!inner`, `pass_active`                                                   |
| `lib/dal/passLeads.ts:159`    | `insertPassLead`                                     | service role | insert, maps 23505 to `duplicate_code`                                                                  |
| `lib/dal/passLeads.ts:178`    | `markPassLeadNotified`                               | service role | stamps `notified_at`                                                                                    |
| `lib/dal/partnerLeads.ts:100` | `fetchPartnerLeads`                                  | owner SSR    | owner's leads, used by `components/partner/PartnerLeadsSection.tsx` on `app/dashboard/partner/page.tsx` |
| `lib/dal/leadContact.ts:36`   | `setPassLeadContacted`                               | browser      | RPC `set_pass_lead_contacted` (175, definer)                                                            |
| `lib/dal/adminLeads.ts:98`    | `fetchAdminLeads` (+ counts `:168`, partners `:199`) | service role | admin leads tab                                                                                         |

`featured_partners`: `lib/dal/featuredPartners.ts` (9 queries: `fetchActivePartners:109`,
`fetchPartnerByUserId:136`, `fetchPartnerById:158`, `fetchPartnerInstructors:180`,
`fetchPartnerSessions:205`, `fetchPartnerStats:257`, `fetchAllPartners:285`,
`updatePartnerStatus:304`, `updatePartnerTier:333`, `incrementPartnerMetric:356`,
`selfActivatePartner:389`, `applyForPartnership:414`), `lib/dal/gymVenue.ts`
(`fetchPartnersByIds:89`, `fetchPartnersForInstructors:120`, `fetchRosterCount:153`),
`lib/dal/gymDirectory.ts:24,73`, `lib/dal/venueRequests.ts:126`, `lib/dal/adminLeads.ts:211`.

**Overlap worth using:** the owner already has a leads section with a
contacted toggle at `app/dashboard/partner/`. The prototype's "Send offer"
button is that toggle. T-AV26 should reuse `set_pass_lead_contacted`, not
build a second contacted writer.

### 2.5 `pass_leads` as the database has it

Columns (19): `id, created_at, slug, partner_id (nullable, ON DELETE SET NULL),
instructor_id, name, whatsapp, email (NOT NULL), choice_1, choice_2, src, code,
pass_code (UNIQUE), consent_text, consent_at, user_agent, notified_at,
contacted_at, tribe_user_id`. No triggers. None of the T-AV21/T-AV22 columns
exist. Matches T-AV1.

Policies (identical locally and in the dump):

| policy                     | cmd    | predicate                                                                                                                      |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `Anyone can claim a pass`  | INSERT | shape checks AND `notified_at IS NULL AND contacted_at IS NULL AND tribe_user_id IS NULL AND pass_is_active(partner_id, slug)` |
| `Partner reads own leads`  | SELECT | `is_app_admin() OR` partner owner (`featured_partners.user_id = auth.uid()`)                                                   |
| `Admins manage pass leads` | ALL    | `is_app_admin()`                                                                                                               |

Production grants (dump 11658-11660, migration 173 `:167-169`): anon INSERT;
authenticated SELECT, INSERT; service_role all. **No UPDATE for any client role.**

**F2 in detail.** A new column added with `ALTER TABLE ... ADD COLUMN` inherits
table-level privileges. So after T-AV21 and T-AV22:

- anon and authenticated can **INSERT** `attended_at`, `attended_marked_by`,
  `attended_method`, `referred_by_athlete_id`, `outcome`, `retained_at`,
  `bonus_settled_at` directly through PostgREST, bypassing `/api/pase`, and the
  INSERT policy does not constrain any of them. Anyone with the public anon key
  could file a lead already "attended" and "joined", credited to any athlete.
  That is a bonus-fraud path, since the gym pays per joined guest.
- authenticated can **SELECT** them, limited by RLS to the owner and admin.
  Fine.
- UPDATE: not granted. The spec's "no direct UPDATE grant" holds without work;
  it is INSERT that it misses.

Fix, for T-AV21 and T-AV22 to choose: extend the INSERT policy's `WITH CHECK`
with `... IS NULL` for every new column (alters an existing policy, `RISK:
HIGH`), or replace anon/authenticated table-level INSERT with a column-list
INSERT grant. The second is a grant regime change on a table printed on QR
posters and needs a rehearsal. Either way, **the mutation proof is: insert as
anon with `referred_by_athlete_id` set, and it must fail.**

### 2.6 `partner_instructors` (the coach list)

Columns: `id, partner_id, instructor_id, role text DEFAULT 'instructor',
is_active boolean DEFAULT true, created_at`. `partner_id`, `instructor_id`,
`role` and `is_active` are all **nullable**; `role` has **no CHECK**. UNIQUE
`(partner_id, instructor_id)`, both FKs `ON DELETE CASCADE`.

Policies:

| policy                            | cmd    | predicate                                                              |
| --------------------------------- | ------ | ---------------------------------------------------------------------- |
| `Anyone can read active`          | SELECT | `is_active = true` (so the coach list is public)                       |
| `Partners manage own instructors` | ALL    | owner of the partner; no `WITH CHECK`, so `USING` doubles as the check |

For this program:

- "Active coach" must be written `is_active IS TRUE`, never `= true` in a
  context where NULL matters, and never `IS NOT FALSE`.
- **Coach status is owner-asserted.** An owner can add any user id as a coach
  without that user's consent. It only grants power over that owner's own
  leads, so it is not an escalation, but it means "coach" is not a verified
  role, and a coach sees guests' first names.
- `role` is free text. The spec does not distinguish coach from front desk, so
  no enum is needed now; do not key anything on `role`.
- Local seed: **0 rows**. T-AV22's seed must create them.

`featured_partners` has **no owner UPDATE policy** (owner can SELECT own row,
INSERT an application, admin does the rest). No impact, because the program's
settings live in the new `athlete_programs`, but it confirms the spec is right
not to put settings on `featured_partners`.

### 2.7 `lib/doorCheckin.ts` / `host_add_session_guest`

The file is **`lib/dal/doorCheckin.ts`**, not `lib/doorCheckin.ts`.

- `:21-40` `addSessionGuest` calls `host_add_session_guest(p_session_id,
p_guest_name)`; `:46-66` `removeSessionGuest`. One caller:
  `components/session/DoorCheckInCard.tsx`.
- The RPC is `SECURITY DEFINER`, returns `jsonb {success, participant_id?,
error?}`, and is **session-scoped** (creator or admin) and writes
  `session_participants`. It knows nothing about partners or passes.

**Reusable as a pattern, not as code.** Its `{success, error}` jsonb shape and
the `parseRpcBody` normalizer (`:12-14`) are a good template for
`av_confirm_pass_attendance`'s return. Nothing in it can confirm a pass.

### 2.8 QR renderer (F7)

- `package.json`: no QR package. `node_modules`: no QR package at any depth
  checked (`find -maxdepth 4`).
- The only QR in the repo is `public/download/index.html:123`, a static page
  loading `qrcodejs` from `cdnjs`.
- `middleware.ts:226-230` CSP `script-src` is `'self' 'unsafe-inline'` plus
  PostHog. **No cdnjs**, so the CDN approach cannot run on an app route. It
  would also make a stranger's pass page depend on a third-party script.
- Scanning: there is no in-app scanner and none is needed. The spec's "scan"
  is the coach's phone camera opening the URL encoded in the QR. That needs a
  QR on the **voucher**, which **no ticket in the spec adds** (T-AV21 builds the
  target page, T-AV24 adds the athlete's link QR, nobody touches
  `PaseForm.tsx:256-285` or the lead email).

**Needs Al's OK (parent section 11, spec section 9):** one dependency. The
prototype itself uses `qrcode-generator` 1.4.4 (MIT, no dependencies, ~20 KB),
rendered to SVG with `isDark(r, c)`. Rendered **on the server** it adds nothing
to the client bundle and works in the lead email too. If declined, the fallback
is showing the pass code in large type (today's behaviour) plus manual entry on
the door screen; the scan flow then becomes "type the code".

### 2.9 Other things the code says that the tickets depend on

- **Flag.** `lib/features/athleteValue.ts` has **no "known list" of features**
  to add `athletes` to (spec 0.7). Features are free text in
  `ATHLETE_VALUE_FEATURES` (`isFeatureListed`, `:108`), and **unset means every
  feature is on**. So D6's "the feature list includes `athletes`" is true when
  the variable is unset. Also, `isAthleteValueEnabled` (`:132`) always admits
  an app admin whatever the mode. **D6 must not reuse it for the anonymous
  guest path**: an admin claiming a pass while testing would get attribution
  with the flag off. T-AV23 needs its own named predicate:
  `mode in (all, allowlist) AND isFeatureListed('athletes') AND program.is_active`.
- **Middleware.** `middleware.ts:58` lists `'/pase'` in `publicPaths`, matched
  as a prefix (`:139-145`). So `/pase/verificar/...` is **public to the auth
  gate**, and the page must redirect a signed-out coach itself. Also
  `lib/publicShareRoutes.ts:30` suppresses the install modal and FeedbackWidget
  under `/pase/`, which will include the coach's verify page. Acceptable, but
  deliberate or not, say so in T-AV21.
- **Log mode (F8).** `grep -rl 'EMAIL_MODE\|PUSH_MODE'` over `app lib
components hooks scripts supabase/functions` returns only
  `scripts/av-guard.mjs`. `lib/email/passLead.ts:16-19` sends whenever
  `RESEND_API_KEY` is set. `scripts/av-dev.mjs:40` lets the real environment
  win over `.env.av.local`, so a shell with that key exported would send real
  mail from the branch. T-AV27's "log mode only" needs an actual mode switch in
  the send path, and its "dry run output" needs something to print.
- **Seed (F9, F10).** `scripts/seed-bullbox.sql` opens with "Seeds CrossFit
  BullBox as an active gym partner ... run once, by hand". It is for the real
  gym. `npm run av:seed` runs `scripts/av-seed-local.mjs`, which is the only
  place local fixtures belong. Local now: 7 users, 1 partner
  (`bullbox-prueba`, gym, `pass_active`, owned by the "BullBox (Prueba)"
  user), **0 `partner_lead_routing`, 0 `partner_instructors`, 0 `pass_leads`,
  0 admins**.
- **E2E.** `@playwright/test` ^1.60, `playwright.config.ts`, `e2e/smoke.spec.ts`,
  and `e2e/authenticated.spec.ts.disabled`. T-AV27 has a base to build on; the
  authenticated suite is disabled today.

---

## 3. Step 3: the prototype, screen by screen

`Tribe_Atletas_Prototipo.html` (792,845 bytes, of which ~725 KB are base64
images). Four role views plus demo chrome, ES/EN.

### 3.1 Mapping

| id  | prototype screen / state                                                                                                  | route                              | ticket                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------- |
| A1  | Athlete home: hero photo, level pill, name, gym line                                                                      | `/atletas/`                        | T-AV24                                          |
| A1  | Stats: Invited, Showed up, Joined (3 tiles)                                                                               | `/atletas/`                        | T-AV24 (spec adds Stayed)                       |
| A1  | "Your path" card: progress bar to level up, 3-rung ladder, rung 3 "Coming soon"                                           | `/atletas/`                        | T-AV24 ladder only; progress NOT COVERED (N1)   |
| A1  | Guest pass card: link box, copy, Share on WhatsApp, helper line                                                           | `/atletas/`                        | T-AV24                                          |
| A1  | Activity feed (appears after events)                                                                                      | `/atletas/`                        | NOT COVERED (N2)                                |
| A1  | Rewards: training at BullBox (Active / Pending), Fruta Vida smoothie per show-up, new-member bonus (amount or `[AMOUNT]`) | `/atletas/`                        | T-AV24 partly; smoothie NOT COVERED (N3)        |
| A1  | Bottom nav (Profile active), bell                                                                                         | existing nav                       | unchanged (spec)                                |
| A2  | WhatsApp share sheet: recipient, message bubble, link preview card with hero image, Send / Cancel                         | `wa.me` hand-off                   | T-AV24 message; preview card NOT COVERED (N5)   |
| G0  | "Laura has no invitation yet" (demo only)                                                                                 | none                               | demo chrome                                     |
| G1  | WhatsApp chat with the invite bubble and link card                                                                        | WhatsApp, outside the app          | n/a                                             |
| G2  | Invite landing: gym hero photo, "BullBox x Tribe" tag, athlete avatar, "Juan invites you / Train with him", perk pills    | `/pase/[slug]/?src=atleta&code=`   | T-AV23 chip only; rest NOT COVERED (N6)         |
| G2  | Class picker (radio, day and time), name, WhatsApp, consent, gym address, 3 photos, claim button, "one per person" line   | `/pase/[slug]/`                    | existing form; differences in N7, N8, N9        |
| G2  | Validation errors (name, phone, consent)                                                                                  | `/pase/[slug]/`                    | existing                                        |
| G3  | Voucher: gym tag, "First class free", QR of `/pase/verificar/{code}`, code, name, class, when, invited by with avatar     | `/pase/[slug]/` confirmation       | QR NOT ASSIGNED (N10)                           |
| G3  | Add to calendar; "show it at the door" line                                                                               | same                               | NOT COVERED (N10)                               |
| G3  | Banners seen by the guest: "Attendance confirmed", "You're a member now"                                                  | same                               | NOT COVERED (N10)                               |
| C1  | Coach mode: gym bar, "Today's class" name and time, Scan button                                                           | `/atletas/gym/[partnerId]/puerta/` | T-AV25; class header NOT COVERED (N15)          |
| C1  | Expected guests (Expected pill), arrived rows (Arrived / New member), empty state                                         | `/atletas/gym/[partnerId]/puerta/` | T-AV25                                          |
| C2  | Scan: camera viewfinder, manual pass code field, "today's passes" quick pick; errors empty / not found / already used     | none                               | NOT COVERED (N11); phone camera replaces it     |
| C3  | Result: confirmed, guest, "first visit", "athlete already earned credit" banner                                           | `/pase/verificar/[passCode]/`      | T-AV21 + T-AV25; first-visit label N12          |
| C3  | "Next: your close": the gym's welcome offer shown to the coach                                                            | `/pase/verificar/[passCode]/`      | NOT COVERED (N12)                               |
| C3  | Outcomes: Signed up; Follow up in 24 hours; follow-up banner "we'll remind you tomorrow"; joined banner with bonus        | same                               | T-AV25 (4 outcomes); reminder NOT COVERED (N12) |
| D1  | Gym summary: KPIs Invited, Showed up, New members, **To close**                                                           | `/atletas/gym/[partnerId]/`        | T-AV26; To close N13                            |
| D1  | Funnel (3 steps), "green is the athlete, blue is your close"                                                              | same                               | T-AV26 (4 steps)                                |
| D1  | Show-ups per week chart, 6 weeks                                                                                          | same                               | NOT COVERED (N13)                               |
| D1  | "To close today" list with Send offer / Offer sent                                                                        | same                               | NOT COVERED (N13); maps to `contacted_at`       |
| D2  | Athletes table: level, invited, showed up, new members, show-up rate, "month's bonus (you pay)"                           | same, Athletes tab                 | T-AV26; bonus column N14                        |
| D3  | Guests table with filters All / Expected / Came / Members, invited by, pass, status, Send offer                           | same, Guests tab                   | T-AV26                                          |
| D4  | Settings: welcome offer, bonus COP, **toggle** "Captains train at BullBox", save, no-commission footer                    | same, Settings tab                 | T-AV26; toggle vs text N16                      |
| X   | Demo chrome: role switcher, ES/EN, reset, walkthrough, event log, toast                                                   | none                               | demo only                                       |

Spec surfaces with no prototype screen (fine, the spec wins; listed so nobody
looks for a mockup): athlete "not in a program" page, Rules card, Stayed /
retained, Not now and Already member outcomes, pause / end / change level,
retention days, pilot dates, max athletes, Add athlete, `/admin/atletas/`.

### 3.2 Not covered: in the prototype, no home in the spec

| #   | prototype has                                                                                                                                                        | why it matters                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **Automatic promotion** Captain to Tribe Athlete at 10 verified show-ups, with a progress bar and "BullBox now pays you for every member who stays"                  | Spec levels are set by owner or admin only. The two models conflict; pick one before T-AV22 (it decides whether `level` is stored or computed).                                                         |
| N2  | Activity feed on the athlete home                                                                                                                                    | No event log table in the spec. Could be derived from lead timestamps later.                                                                                                                            |
| N3  | Third-party perk "Fruta Vida smoothie, one per guest who shows up", also in the guest perk pill and the WhatsApp message                                             | **Parent decision 4 is BLOCKING: no invented perks in copy.** Nothing in the spec stores a partner-of-partner perk.                                                                                     |
| N4  | Short link `tribe.app/p/juan-bullbox`                                                                                                                                | Spec uses `/pase/{slug}/?src=atleta&code={ref_code}` and forbids new URL shapes. `tribe.app` is not the deployed domain.                                                                                |
| N5  | Rich link preview (hero image, "Juan invites you to BullBox")                                                                                                        | `/pase/[slug]` metadata is deliberately thin and noindex (`page.tsx:46-53`), with no Open Graph image. A shared link previews as "Tu primera clase gratis \| Tribe". A per-athlete OG card is new work. |
| N6  | Personalised landing: athlete photo, "X invites you, train with him", gym hero and photo strip, address                                                              | Spec gives a first-name chip only, and its lookup returns first name only. Showing the athlete's photo to a stranger is a privacy decision the spec did not make. "Con él" is also gendered.            |
| N7  | Class picker with day and time per class                                                                                                                             | `pass_options` is free labels per group; there are no times. Close enough to reuse, not the same.                                                                                                       |
| N8  | **No email field**                                                                                                                                                   | The real form requires email (`route.ts:161-162`, NOT NULL in 173). The spec keeps the existing form; the prototype is wrong here.                                                                      |
| N9  | Consent: "I agree that BullBox may contact me ... and that **Tribe records my attendance**"                                                                          | The spec's extra line covers sharing with the athlete, not recording attendance. Parent T-AV10 guardrail says the data policy must cover recording attendance. See copy table row `consent.attendance`. |
| N10 | Voucher QR, class, when, invited-by with avatar, add to calendar, and status banners the **guest** sees after the door                                               | QR is assigned to no ticket (F7). Guest-side status needs the anonymous guest to read their own row, which `pass_leads` forbids by design; nothing in the spec provides it.                             |
| N11 | In-app camera scanner, manual pass-code entry, today's-passes quick pick                                                                                             | Spec relies on the phone's own camera opening the URL. **Manual code entry is cheap and worth adding to T-AV25** as the no-camera fallback alongside the list.                                          |
| N12 | Door result extras: "first visit" label, "athlete already earned credit", the gym's welcome offer shown to the coach, "follow up in 24 h, we'll remind you tomorrow" | `welcome_offer_*` is stored (T-AV22) but no ticket displays it at the door. A reminder needs a notification or cron, which the spec excludes.                                                           |
| N13 | "To close" KPI and list, "Send offer", weekly show-ups chart                                                                                                         | "To close" = showed up and no outcome yet; derivable. "Send offer" maps to the existing `contacted_at` toggle. The weekly chart is new.                                                                 |
| N14 | "Month's bonus (you pay)" = joined count x bonus amount                                                                                                              | Spec stores no per-lead amount and shows counts of owed / settled. Multiplying by today's amount would restate history if the gym changes it. Recommend counts only.                                    |
| N15 | Coach header "Today's class: HYROX Training Club, 6:00 p.m."                                                                                                         | Leads are not tied to a class or time. The door list is "claimed in the last 14 days", not "today's class".                                                                                             |
| N16 | Settings "access" as a checkbox                                                                                                                                      | Spec has free-text `class_access_en/es`. Text is more flexible; the toggle is simpler. Pick one.                                                                                                        |
| N17 | Gendered Spanish throughout ("Invitada", "Bienvenida", "con él")                                                                                                     | Guest and athlete gender are unknown. Copy table proposes neutral forms.                                                                                                                                |
| N18 | "Invite-to-program screen" (spec section 1 names it as a home for the emotional line)                                                                                | No ticket builds it and D5 says there is no self-signup. The "not in a program" page (T-AV24) is the only candidate.                                                                                    |

---

## 4. Step 4: the 8200 to 8249 block

Checked 2026-09-26 after `git fetch origin`:

- `athlete/main`: no file matching `^8[0-9]{3}_` in `supabase/migrations/`.
- `origin/main` (`7575e74e`): none. Highest is `193_private_communities_visible_to_members.sql`.
- Every local branch and every remote branch, scanned with `git ls-tree`: none.

**Free.** Per CLAUDE.md, re-read at the moment each 82xx file is written.

Numbering interaction checked: the repo's other migration guards match
`^\d{3}_` (`supabase/avMigrationCheck.ts:11-13`), so a 4-digit `8200_` file is
invisible to them and seen only by `av-migration-check` (block 8000-8999,
`:58-59`). That is what T-AV0 intended.

**F3, the header.** `supabase/avMigrationCheck.ts` requires, in the leading
comment block:

- `:166` a line matching `^\s*--\s*PROGRAM:\s*T-AV\s*$`. The spec's
  `-- PROGRAM: T-AV (sub-program T-AV20 Tribe Athletes)` **does not match**:
  the pattern is end-anchored.
- `:169` `-- TICKET: T-AVn` (the spec's is fine).
- `:132` one `-- TABLE: <name> OWNER: consumer|tribe-os|t-av-new` per table the
  file creates or alters. The spec's `-- OWNER: <table or function>` is not
  recognised. `pass_leads` would be `OWNER: consumer`; new tables `t-av-new`.
- `:198` a quoted `'<file id>'` probe in `supabase/verify-migration-state.sql`.
  So every 82xx migration also edits that file.

Recommended header, satisfying both the check and the spec's intent:

```sql
-- PROGRAM: T-AV
-- SUB-PROGRAM: T-AV20 Tribe Athletes
-- TICKET: T-AV21
-- TABLE: public.pass_leads OWNER: consumer
-- ALTERS: public.pass_leads (3 columns), policy "Anyone can claim a pass"
-- RISK: HIGH
```

---

## 5. Step 5: every new user-facing string, English first

Al approves the EN column. ES is a proposal and ships only after EN is
approved. `{x}` is a substitution. Neutral Spanish is used where the guest's or
athlete's gender is unknown (N17); where the spec already gave ES, it is kept
and marked **spec**.

Nothing here uses "sponsorship" or "patrocinio" (D7). Nothing names a
third-party perk (parent decision 4).

### 5.1 Guest, `/pase/[slug]/` (T-AV23)

| key                  | EN                                                                                         | proposed ES                                                               | screen                                       |
| -------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------- |
| `pase.invitedBy`     | Invited by {firstName}                                                                     | Te invita {firstName} (spec had "Invitado por", gendered)                 | chip above form                              |
| `consent.athlete`    | Your first name and whether you attended will be shared with {firstName}, who invited you. | Tu nombre y si asististe se compartirán con {firstName}, quien te invitó. | under consent                                |
| `consent.attendance` | {gym} and Tribe will record whether you attended your class.                               | {gym} y Tribe registrarán si asististe a tu clase.                        | under consent (**decision**: add or not, N9) |
| `pase.voucher.qrAlt` | QR code for pass {passCode}                                                                | Código QR del pase {passCode}                                             | voucher                                      |
| `pase.voucher.howTo` | Show this at the door. The coach scans it and you are in.                                  | Muéstralo en la entrada. El coach lo escanea y listo.                     | voucher                                      |

The stored `consent_text` for an attributed lead is `CONSENT_TEXT_V1` plus
`consent.athlete` (plus `consent.attendance` if approved). Longest ES
combination is about 330 characters, under the 500 CHECK.

### 5.2 Door: `/pase/verificar/[passCode]/` and `/atletas/gym/[partnerId]/puerta/` (T-AV21, T-AV25)

| key                     | EN                                             | proposed ES                                             | screen               |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------- | -------------------- |
| `door.title`            | Confirm attendance                             | Confirmar asistencia                                    | verify               |
| `door.confirm`          | Confirm attendance                             | Confirmar asistencia (**spec**)                         | verify               |
| `door.gym`              | Gym                                            | Gimnasio                                                | verify               |
| `door.guest`            | Guest                                          | Invitado                                                | verify               |
| `door.claimedOn`        | Claimed on {date}                              | Reclamado el {date}                                     | verify               |
| `door.invitedBy`        | Invited by {athleteFirstName}                  | Invitación de {athleteFirstName}                        | verify               |
| `door.confirmed`        | Attendance confirmed                           | Asistencia confirmada                                   | verify               |
| `door.alreadyConfirmed` | Already confirmed on {date}                    | Ya se confirmó el {date}                                | verify               |
| `door.notYourGym`       | This pass is not for your gym.                 | Este pase no es de tu gimnasio. (**spec**)              | verify               |
| `door.outcomeTitle`     | What happened after class?                     | ¿Qué pasó después de la clase?                          | verify, list         |
| `door.outcome.joined`   | Joined                                         | Se inscribió (**spec**)                                 | verify, list         |
| `door.outcome.followUp` | Follow up                                      | Seguimiento (**spec**)                                  | verify, list         |
| `door.outcome.notNow`   | Not now                                        | No por ahora (**spec**)                                 | verify, list         |
| `door.outcome.member`   | Already a member                               | Ya era miembro (**spec**)                               | verify, list         |
| `door.outcomeSaved`     | Saved                                          | Guardado                                                | verify, list         |
| `door.confirmFirst`     | Confirm attendance first.                      | Primero confirma la asistencia.                         | verify, list         |
| `door.error`            | We could not save that. Try again.             | No pudimos guardar eso. Intenta de nuevo.               | verify, list         |
| `door.list.title`       | Expected guests                                | Invitados por llegar                                    | list                 |
| `door.list.help`        | People who claimed a pass in the last 14 days. | Personas que reclamaron su pase en los últimos 14 días. | list                 |
| `door.list.arrived`     | Arrived                                        | Llegó (**spec**)                                        | list toggle          |
| `door.list.empty`       | Nobody expected right now.                     | Nadie pendiente por ahora.                              | list                 |
| `door.codeLabel`        | Pass code                                      | Código del pase                                         | list (N11, if added) |
| `door.codeNotFound`     | We could not find that pass. Check the code.   | No encontramos ese pase. Revisa el código.              | list (N11, if added) |

`door.codeNotFound` must be the same response for "no such code" and "a code
from another gym", or it enumerates codes (T-AV21 acceptance 3 applies to it).

### 5.3 Athlete home, `/atletas/` (T-AV24)

| key                       | EN                                                                                | proposed ES                                                                                | screen               |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------- |
| `athlete.emotional`       | If you've ever wanted to be a professional athlete, it's not too late.            | Si alguna vez quisiste ser atleta profesional, todavía estás a tiempo.                     | home, not-in-program |
| `athlete.none.title`      | You are not a Tribe Athlete yet                                                   | Todavía no eres Atleta Tribe (**spec**)                                                    | not-in-program       |
| `athlete.none.body`       | Gyms choose their Tribe Athletes. If you bring people to train, talk to your gym. | Cada gimnasio elige a sus Atletas Tribe. Si traes gente a entrenar, habla con tu gimnasio. | not-in-program       |
| `athlete.none.cta`        | Talk to your gym                                                                  | Habla con tu gimnasio (**spec**)                                                           | not-in-program       |
| `level.captain`           | Captain                                                                           | Capitán (**spec**)                                                                         | badge                |
| `level.athlete`           | Tribe Athlete                                                                     | Atleta Tribe (**spec**)                                                                    | badge                |
| `level.sponsored`         | Coming soon                                                                       | Próximamente (**spec**)                                                                    | badge                |
| `athlete.atGym`           | Athlete at {gym}                                                                  | Atleta en {gym}                                                                            | hero                 |
| `link.title`              | My link                                                                           | Mi link (**spec**)                                                                         | Mi link              |
| `link.copy`               | Copy link                                                                         | Copiar link                                                                                | Mi link              |
| `link.copied`             | Link copied                                                                       | Link copiado                                                                               | toast                |
| `link.share`              | Share on WhatsApp                                                                 | Compartir por WhatsApp                                                                     | Mi link              |
| `link.shareMessage`       | Come train with me at {gym}. Your first class is free: {link}                     | Ven a entrenar conmigo en {gym}. Tu primera clase es gratis: {link}                        | WhatsApp text        |
| `link.qrCaption`          | Let people scan this to open your link.                                           | Que escaneen este código para abrir tu link.                                               | Mi link              |
| `link.help`               | Everyone who comes in through your link and shows up counts for you.              | Cada persona que entre con tu link y llegue a clase cuenta para ti.                        | Mi link              |
| `numbers.title`           | My numbers                                                                        | Mis números (**spec**)                                                                     | Mis números          |
| `numbers.invited`         | Invited                                                                           | Invitados (**spec**)                                                                       | Mis números          |
| `numbers.showedUp`        | Showed up                                                                         | Llegaron (**spec**)                                                                        | Mis números          |
| `numbers.joined`          | Joined                                                                            | Se inscribieron (**spec**)                                                                 | Mis números          |
| `numbers.stayed`          | Stayed                                                                            | Siguen (**spec**)                                                                          | Mis números          |
| `numbers.zero`            | Share your link to invite your first guest.                                       | Comparte tu link para invitar a tu primera persona.                                        | Mis números          |
| `guests.title`            | My guests                                                                         | Mis invitados (**spec**)                                                                   | Mis invitados        |
| `guests.empty`            | No guests yet.                                                                    | Todavía no tienes invitados.                                                               | Mis invitados        |
| `guests.status.claimed`   | Claimed                                                                           | Reclamó (**spec**)                                                                         | status chip          |
| `guests.status.arrived`   | Arrived                                                                           | Llegó (**spec**)                                                                           | status chip          |
| `guests.status.joined`    | Joined                                                                            | Se inscribió (**spec**)                                                                    | status chip          |
| `guests.status.followUp`  | Follow up                                                                         | Seguimiento (**spec**)                                                                     | status chip          |
| `guests.status.notNow`    | Not now                                                                           | No por ahora (**spec**)                                                                    | status chip          |
| `guests.status.stayed`    | Stayed                                                                            | Sigue                                                                                      | status chip          |
| `guests.status.noCredit`  | Does not count                                                                    | No cuenta (**spec**)                                                                       | status chip          |
| `guests.reason.member`    | Already a member of {gym}                                                         | Ya era miembro de {gym}                                                                    | reason               |
| `guests.reason.returning` | Had already trained at {gym}                                                      | Ya había entrenado en {gym}                                                                | reason               |
| `earn.title`              | What you earn                                                                     | Lo que ganas (**spec**)                                                                    | Lo que ganas         |
| `earn.showup`             | Show-up reward                                                                    | Premio por asistencia                                                                      | Lo que ganas         |
| `earn.bonus`              | New member bonus                                                                  | Bono por nuevo miembro                                                                     | Lo que ganas         |
| `earn.paysDirect`         | {gym} pays you directly. Tribe never handles money.                               | {gym} te paga directo. Tribe no maneja dinero. (**spec**)                                  | Lo que ganas         |
| `rules.title`             | The rules                                                                         | Reglas (**spec**)                                                                          | Reglas               |
| `rules.1`                 | Only people who actually show up count. A coach confirms each one at the door.    | Solo cuentan las personas que llegan. Un coach confirma cada una en la entrada.            | Reglas               |
| `rules.2`                 | A new member counts only after coming to a class.                                 | Un nuevo miembro cuenta solo si antes vino a clase.                                        | Reglas               |
| `rules.3`                 | Only new people count. Someone who already trained at {gym} does not.             | Solo cuentan personas nuevas. Quien ya entrenó en {gym} no cuenta.                         | Reglas               |
| `rules.4`                 | Using your own link does not count.                                               | Usar tu propio link no cuenta.                                                             | Reglas               |
| `entry.title`             | Tribe Athletes                                                                    | Atletas Tribe (**spec**, D1)                                                               | Profile, Home card   |
| `entry.body`              | See your link and your guests.                                                    | Mira tu link y tus invitados.                                                              | Profile, Home card   |

### 5.4 Gym dashboard, `/atletas/gym/[partnerId]/` (T-AV26)

| key                       | EN                                                                                            | proposed ES                                                                          | screen        |
| ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------- |
| `gym.title`               | Tribe Athletes                                                                                | Atletas Tribe                                                                        | header        |
| `gym.tab.summary`         | Summary                                                                                       | Resumen                                                                              | tabs          |
| `gym.tab.athletes`        | Athletes                                                                                      | Atletas                                                                              | tabs          |
| `gym.tab.guests`          | Guests                                                                                        | Invitados                                                                            | tabs          |
| `gym.tab.settings`        | Settings                                                                                      | Ajustes (**spec**)                                                                   | tabs          |
| `gym.rate.showedUp`       | {n}% of those invited                                                                         | {n}% de los invitados                                                                | funnel        |
| `gym.rate.joined`         | {n}% of those who came                                                                        | {n}% de los que llegaron                                                             | funnel        |
| `gym.rate.stayed`         | {n}% of new members                                                                           | {n}% de los nuevos miembros                                                          | funnel        |
| `gym.col.athlete`         | Athlete                                                                                       | Atleta                                                                               | table         |
| `gym.col.level`           | Level                                                                                         | Nivel                                                                                | table         |
| `gym.col.status`          | Status                                                                                        | Estado                                                                               | table         |
| `gym.col.owed`            | Bonuses owed                                                                                  | Bonos por pagar                                                                      | table (owner) |
| `gym.col.paid`            | Bonuses paid                                                                                  | Bonos pagados                                                                        | table (owner) |
| `gym.status.active`       | Active                                                                                        | Activo                                                                               | table         |
| `gym.status.paused`       | Paused                                                                                        | En pausa                                                                             | table         |
| `gym.status.ended`        | Ended                                                                                         | Terminado                                                                            | table         |
| `gym.action.pause`        | Pause                                                                                         | Pausar                                                                               | table         |
| `gym.action.end`          | End                                                                                           | Terminar                                                                             | table         |
| `gym.action.resume`       | Resume                                                                                        | Reactivar                                                                            | table         |
| `gym.action.level`        | Change level                                                                                  | Cambiar nivel                                                                        | table         |
| `gym.guest.markStayed`    | Mark as stayed                                                                                | Marcar como sigue (**spec**)                                                         | guests        |
| `gym.guest.stayedFrom`    | Available from {date}                                                                         | Disponible desde el {date}                                                           | guests        |
| `gym.guest.bonusPaid`     | Bonus paid                                                                                    | Bono pagado (**spec**)                                                               | guests        |
| `gym.settings.offer`      | Welcome offer                                                                                 | Oferta de bienvenida                                                                 | settings      |
| `gym.settings.showup`     | Show-up reward                                                                                | Premio por asistencia                                                                | settings      |
| `gym.settings.showupHint` | For example: unlimited classes while you are in the program                                   | Por ejemplo: clases ilimitadas mientras estés en el programa                         | settings      |
| `gym.settings.access`     | Class access                                                                                  | Acceso a clases                                                                      | settings      |
| `gym.settings.bonus`      | New member bonus (COP, optional)                                                              | Bono por nuevo miembro (COP, opcional)                                               | settings      |
| `gym.settings.bonusNote`  | Bonus note                                                                                    | Nota del bono                                                                        | settings      |
| `gym.settings.retention`  | Days before a new member counts as staying                                                    | Días para contar a un nuevo miembro como que sigue                                   | settings      |
| `gym.settings.pilotStart` | Pilot start                                                                                   | Inicio del piloto                                                                    | settings      |
| `gym.settings.pilotEnd`   | Pilot end                                                                                     | Fin del piloto                                                                       | settings      |
| `gym.settings.max`        | Maximum athletes                                                                              | Máximo de atletas                                                                    | settings      |
| `gym.settings.en`         | English                                                                                       | Inglés                                                                               | settings      |
| `gym.settings.es`         | Spanish                                                                                       | Español                                                                              | settings      |
| `gym.settings.save`       | Save                                                                                          | Guardar                                                                              | settings      |
| `gym.settings.saved`      | Settings saved                                                                                | Ajustes guardados                                                                    | toast         |
| `gym.money`               | You pay bonuses directly to the athlete. Tribe charges no commission and never handles money. | Tú pagas los bonos directo al atleta. Tribe no cobra comisión y nunca maneja dinero. | footer        |
| `gym.add.title`           | Add athlete                                                                                   | Agregar atleta (**spec**)                                                            | add           |
| `gym.add.search`          | Search by name or email                                                                       | Busca por nombre o correo                                                            | add           |
| `gym.add.cap`             | You already have {max} active athletes. Pause or end one to add another.                      | Ya tienes {max} atletas activos. Pausa o termina uno para agregar otro.              | add error     |
| `gym.add.already`         | This person is already in your program.                                                       | Esta persona ya está en tu programa.                                                 | add error     |

### 5.5 Admin, `/admin/atletas/` (T-AV27)

| key                  | EN                            | proposed ES                          | screen                                                                                                              |
| -------------------- | ----------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `admin.title`        | Tribe Athletes programs       | Programas de Atletas Tribe           | admin                                                                                                               |
| `admin.create`       | Create program                | Crear programa                       | admin                                                                                                               |
| `admin.partner`      | Partner                       | Aliado                               | admin                                                                                                               |
| `admin.active`       | Program active                | Programa activo                      | admin                                                                                                               |
| `admin.setSponsored` | Set as sponsored (admin only) | Marcar como patrocinado (solo admin) | admin (**internal only**; D7 bars the word from live athlete-facing copy, confirm it is allowed on an admin screen) |

### 5.6 Notifications, log mode (T-AV27)

| key               | EN                       | proposed ES                         | channel          |
| ----------------- | ------------------------ | ----------------------------------- | ---------------- |
| `notify.arrived`  | {guest} arrived at class | {guest} llegó a su clase (**spec**) | athlete push     |
| `notify.joined`   | {guest} joined {gym}     | {guest} se inscribió en {gym}       | athlete push     |
| `email.invitedBy` | Invited by {athlete}     | Invitación de {athlete}             | owner lead email |

`{guest}` is a first name only, per D4.

---

## 6. Step 6: go / no-go, and what the spec got wrong

### 6.1 Go / no-go

| ticket     | verdict                        | conditions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T-AV21** | **GO after one prerequisite**  | (1) Fix local grant fidelity first (F1, a T-AV0 follow-up), or acceptance 5 proves the wrong thing. (2) Header per section 4. (3) Close the INSERT path for the 3 new columns in the same migration (F2) and add "anon INSERT with `attended_at` set fails" to acceptance. (4) Add a definer read, e.g. `av_pass_for_door(p_pass_code)`, returning partner, first name and claim date to authorised callers only, with the same indistinguishable refusal as the write (F6). (5) The page redirects signed-out users itself (middleware treats `/pase/*` as public). |
| **T-AV22** | **GO with changes**            | (1) Seed in `scripts/av-seed-local.mjs`, never `scripts/seed-bullbox.sql` (F9). (2) Seed must add a `partner_lead_routing` row and an admin user (F10), and coaches as `partner_instructors`. (3) Same INSERT closure for the 7 attribution and outcome columns (F2). (4) Add the door-list read function T-AV25 needs (F6). (5) Decide N1 (manual vs automatic level) before writing `level`. (6) Probe matrix only after F1 is fixed.                                                                                                                              |
| **T-AV23** | **NO-GO until Al decides**     | (1) EN approval of `consent.athlete`, and whether to add `consent.attendance` (N9). (2) F4: may `/api/pase` read the session to compare user ids, given `PaseForm.tsx:102-106` promises the claim stays anonymous? If not, rule 4 is email only and acceptance 5's "logged-in user id" case goes. (3) F5: rule 4 by WhatsApp has no athlete number to compare with; drop it or define the source. (4) D6 predicate must not reuse `isAthleteValueEnabled` (admin always on). (5) Who adds the voucher QR (F7, N10); this ticket is the natural home.                 |
| **T-AV24** | **HOLD for two decisions**     | (1) QR dependency OK (F7). (2) EN approval of the emotional line and `link.shareMessage`. Otherwise buildable once T-AV22 lands.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **T-AV25** | **GO after T-AV21 and T-AV22** | Recommend adding manual pass-code entry (N11). Door list needs the definer read (F6), since coaches cannot SELECT `pass_leads`. Welcome offer at the door (N12) is a one-line add if Al wants it.                                                                                                                                                                                                                                                                                                                                                                    |
| **T-AV26** | **GO after T-AV22**            | Reuse `set_pass_lead_contacted` for "Send offer" rather than a second writer (2.4). Decide N14 (counts only, recommended) and N16 (text vs toggle).                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **T-AV27** | **GO with a prerequisite**     | "Log mode" does not exist in code (F8). A mode switch in the email and push send paths comes first, or "log mode only" is enforced by a missing API key. Playwright base exists; the authenticated suite is disabled today.                                                                                                                                                                                                                                                                                                                                          |

### 6.2 What the spec got wrong about the code

1. **Migration header** (0.6): fails `av-migration-check` as written (F3, section 4).
2. **"Add `athletes` to the known list in `lib/features/athleteValue.ts`"** (0.7): there is no known list. Features are free text, and unset means all on (2.9).
3. **`tribe_user_id` "as today"** (T-AV23, parent 7.4): never written by any code; the anonymous POST is a stated design choice (F4).
4. **Rule 4 by WhatsApp**: `users` has no phone or WhatsApp column (F5).
5. **"No direct UPDATE grant on these columns"** (T-AV21): true already. The real exposure is **INSERT**, which the spec does not mention (F2).
6. **`lib/doorCheckin.ts`** (T-AV20 step 2): the file is `lib/dal/doorCheckin.ts`, and `host_add_session_guest` is session-scoped and not reusable for passes (2.7).
7. **Seed location** (T-AV22): `scripts/seed-bullbox.sql` is the real BullBox's production seed (F9).
8. **Coach reads**: the spec gives coaches a verify page and a door list but no read path; RLS gives coaches no SELECT on `pass_leads` (F6).
9. **"Flag off means `/pase/[slug]` byte-for-byte as on main"** holds only if T-AV23's predicate excludes the admin-always-on rule (2.9, D6).
10. **Signed-out redirect on `/pase/verificar/`** assumes middleware protects it; middleware treats all of `/pase` as public (2.9).
11. **Voucher "with QR"** (section 2, Guest row): the voucher has no QR today and no ticket adds one (F7).
12. **Implicit in T-AV1, inherited here:** "the local stack's grants are production's" is false for 16 tables (F1).

### 6.3 Decisions for Al, in the order they block

1. Fix local grant fidelity as a T-AV0 follow-up before T-AV21 (F1). **Blocks T-AV21 acceptance 5 and every T-AV22 probe.**
2. QR dependency: `qrcode-generator` server-side, yes or no (F7). **Blocks T-AV24 and the voucher QR.**
3. Level model: manual (spec) or automatic at N verified show-ups (prototype) (N1). **Blocks T-AV22's `level` column.**
4. T-AV23: may `/api/pase` read the session for self-referral (F4); rule 4 WhatsApp source (F5); add the attendance-recording consent line (N9).
5. EN approval of section 5, the consent line first.
6. Smaller: N11 manual code entry, N12 offer at the door, N14 bonus column, N16 access toggle vs text, `admin.setSponsored` wording.

---

## What this recon did not establish

- **Production row counts.** None were needed for this ticket, and none were
  taken. How many BullBox leads already exist, and whether any real guest
  already attended (rule 3's history), are production questions.
- **The mechanism in F1.** The grant difference is measured; the cause (local
  default privileges) is a hypothesis. Re-measure after the fix rather than
  trusting the explanation.
- **Whether the parent spec's "consolidated push path (T-PUSH1)" exists in a
  form T-AV27 can call.** No code references `T-PUSH1` by name; T-AV27 should
  locate the send path before scoping the notifications.
- **Any behaviour in a browser.** Nothing was run. All findings are from
  source, the schema dump and read-only catalog queries.
