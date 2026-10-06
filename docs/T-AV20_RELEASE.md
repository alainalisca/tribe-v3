# T-AV20 Tribe Athletes: release report

Branch `athlete/main`, T-AV19 to T-AV27c, written 2026-10-01 for the merge
gate (`docs/ATHLETE_VALUE_MERGE_GATE.md`, section 8). Nothing here has run
against production. Every number below was measured on the LOCAL stack
(the production schema dump plus 8200 to 8209, `npm run av:seed`) and is
re-runnable with the script named beside it.

This report is evidence, not a tick. Every proof expires when the code moves;
the gate re-runs them on merge day.

## 1. The tickets and their commits

| Ticket                                                                         | Commit(s) on `athlete/main`                    | Proof script (tests)                                                                                                            | Mutation arms                                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| T-AV19 local grant parity, real log mode, outbound triggers off                | `145c8daf`, `fe0cb7b7`, `1aa05754`, `be3473b1` | `npm run av:schema:verify` (grant parity), spy tests in `lib/email/resendClient.test.ts`, `notificationHelpers.logMode.test.ts` | spy tests, each with a mutation                                   |
| T-AV21 show-up core, door read and confirm, insert path closed                 | `7461132b`                                     | `supabase/recon/t-av21-proof.LOCAL.sh` (22)                                                                                     | `t-av21` driver                                                   |
| T-AV22 program schema, one ledger, definer writes, seed                        | `2519029f`                                     | `t-av22-proof.LOCAL.sh` (62), `docs/T-AV22_PROBES.md`                                                                           | `t-av22-mutations.LOCAL.sh` (9, incl. layered M6/M6b/M8)          |
| T-AV23 attribution, consent lines, voucher QR                                  | `7fb54c56`                                     | `t-av23-proof.LOCAL.sh` (17)                                                                                                    | `t-av23` driver                                                   |
| T-AV24 athlete home `/atletas/`                                                | `27a9ee55`, `4945f303`                         | `t-av24-proof.LOCAL.sh` (34)                                                                                                    | `t-av24-mutations.LOCAL.sh` (7)                                   |
| T-AV25 the door                                                                | `e4480fd4`                                     | `t-av25-proof.LOCAL.sh` (21)                                                                                                    | `t-av25-mutations.LOCAL.sh` (3)                                   |
| T-AV0 follow-up: `av:seed` re-runnable                                         | `ed28598b`                                     | `av:seed` twice: 33 leads, 0 orphans, stable partner ids both times                                                             | removing the clear: the second run fails again                    |
| T-AV26 gym dashboard, athletes, guests, settings                               | `be6abd39`                                     | `t-av26-proof.LOCAL.sh` (53)                                                                                                    | `t-av26-mutations.LOCAL.sh` (6, incl. layered S1 to S3) + 15 unit |
| T-AV27a accent guard placeholders, guests default view, consent covers joining | `627e0a43`                                     | `t-av27a-proof.LOCAL.sh` (5)                                                                                                    | `t-av27a-mutations.LOCAL.sh` (7)                                  |
| T-AV27b Resend error check                                                     | `36d58a18`                                     | `lib/email/passLead.resendError.test.ts`                                                                                        | fails without the fix (U6)                                        |
| T-AV27b admin screen, log-mode notifications                                   | `d9efc11b`                                     | `t-av27b-proof.LOCAL.sh` (28)                                                                                                   | `t-av27b-mutations.LOCAL.sh` (18, incl. layered A1 to A3)         |
| T-AV27c end to end, joined push priority, gate, this report                    | this commit                                    | `t-av27c-proof.LOCAL.sh` (5, test 3 is `npm run test:e2e:av`: 6 Playwright tests)                                               | `t-av27c-mutations.LOCAL.sh` (3)                                  |

Last full run, all proofs in sequence, on the T-AV27c tree: every proof
green, `av:schema:verify` with grant parity OK, `npx tsc --noEmit` clean,
`npm run test:complete` with files-run equal to files-on-disk.

## 2. Acceptance, ticket by ticket

Each line is the ticket's acceptance criterion and where it is proven.

**T-AV19.** Parity script green locally (`av-grant-parity OK`); log mode
proven by spy tests with mutation proofs (Resend never constructed, web push
and FCM never called in log mode); the guard refuses live mode on the branch
(`scripts/avGuard.sendMode.test.ts`); every outbound trigger listed and
disabled locally (`av:schema:verify` fails if one is enabled). Production
checks recorded in `docs/T-AV19_PROD_CHECKS.md`.

**T-AV21.** Owner and active coach confirm; inactive and NULL `is_active`
coaches refused; other partner refused byte for byte for a real and a made-up
code; a direct `UPDATE` as `authenticated` is `42501`; anon INSERT with
`attended_at` refused while a normal claim still succeeds; second confirm
unchanged; flag off is a real 404 on `/pase/verificar/x/` and `/pase/{slug}/`
and `/api/pase` unchanged (frozen `route.flagoff.test.ts`). Proof tests 1 to
11, mutation arms on the partner check and the INSERT `IS NULL` clause.

**T-AV22.** Probe matrix in `docs/T-AV22_PROBES.md` (every role against every
table and function, real JWTs); athlete A cannot read B; the coach payload
has no bonus fields; the sixth athlete and an owner setting `sponsored` are
refused; `joined` without a show-up and retained before `retention_days` are
refused; the ledger returns the pre-written expected table, `ready` at 10 and
not at 9; anon INSERT with any program column set refused (8207 RESTRICTIVE
policy binds admins too). Ten mutation proofs.

**T-AV23.** Flag off identical (frozen tests, no assertion edits); admin with
the flag off gets no attribution; flag on attributes, adds the consent line,
shows the chip and the voucher QR; another partner's slug, paused or ended
athletes, and self-referral by email or WhatsApp get no attribution; a
returning guest is attributed but not credited; a throwing lookup still saves
the lead; `renderQrSvg` never reaches a client bundle.

**T-AV24.** Each seeded athlete renders the ledger's exact numbers, including
9 of 10 and Ready; athlete B never appears for A; flag off is a real 404
(middleware gate, because the root `loading.tsx` streams page-level
`notFound()` as 200); screenshots at 360 and 414 in
`Tribe - Diceus Code/Screens/T-AV24`.

**T-AV25.** Typed code works and answers unknown and other-gym codes the
same; other-partner coach refused on all three paths; `joined` before confirm
refused; the list excludes other partners (mutation-proven). **The physical
second-phone QR scan on the LAN is deferred to the merge gate** (section 8).

**T-AV26.** Owner edits settings through their own session and the athlete
home shows the new text; a coach cannot reach settings (real 404); another
partner's owner gets 404; no bonus field in the coach payload (database and
view-model layers, each mutation-proven); the cap is enforced; Promote is
offered only for a ready captain while the function lets the owner promote
anyone; the settings route's owner check has the three-arm layered proof.

**T-AV27a.** `{placeholders}` are not words to the accent guard and `{max}`
is back; the attributed consent now covers joining; Invitados opens on
"Abiertos", 20 at a time, outcomes behind "Registrar resultado".

**T-AV27b.** Five notification events with the approved copy, through the
consolidated push path only, once per event, credited guests only, within the
cap; owner email gains "Invitación de {athlete}" and a door link (no QR
image); `/admin/atletas/` for app admins with create and switch through the
admin's own session (three-arm layered proof); a refused Resend send no longer
stamps `notified_at`.

**T-AV27c.** A "joined" push skips the daily cap and still counts toward the
weekly 3 (proof tests 1 and 2, arms J1 and J2); the Playwright suite runs the
full loop with the flag on and the real 404s with it off (`npm run
test:e2e:av`, arm E1 names the broken step).

## 3. Who reaches what (flag on)

Every cell measured with real sessions on 2026-10-01 against BullBox (Prueba);
"404" is a real HTTP 404 from middleware. The inactive coach is Felipe.

| Surface                               | Owner             | Active coach      | Inactive coach    | Other gym's owner or coach | Athlete             | App admin         | Signed out                                                                             |
| ------------------------------------- | ----------------- | ----------------- | ----------------- | -------------------------- | ------------------- | ----------------- | -------------------------------------------------------------------------------------- |
| `/atletas/`                           | 200               | 200               | 200               | 200                        | 200 (own data only) | 200               | redirect to `/auth`                                                                    |
| `/atletas/gym/{id}/`                  | 200               | 200, read-only    | 404               | 404                        | 404                 | 200               | redirect to `/auth`                                                                    |
| `/atletas/gym/{id}/ajustes/`          | 200               | 404               | 404               | 404                        | 404                 | 200               | redirect to `/auth`                                                                    |
| `/atletas/gym/{id}/puerta/`           | 200               | 200               | 404               | 404                        | 404                 | 200               | redirect to `/auth`                                                                    |
| `/pase/verificar/{code}/`             | 200               | 200               | refusal sentence  | refusal sentence           | refusal sentence    | 200               | sent to `/auth` by the page (HTTP 200: the root loading boundary streams the redirect) |
| `/admin/atletas/`                     | 404               | 404               | 404               | 404                        | 404                 | 200               | redirect to `/auth`                                                                    |
| `POST /api/atletas/gym/{id}/settings` | 200               | 404               | 404               | 404                        | 404                 | 200               | 307 to `/auth` (middleware)                                                            |
| `POST /api/admin/atletas`             | 404               | 404               | 404               | 404                        | 404                 | 200               | 307 to `/auth` (middleware)                                                            |
| `POST /api/atletas/notify`            | 200, 8209 decides | 200, 8209 decides | 200, nothing told | 200, nothing told          | 200, nothing told   | 200, 8209 decides | 307 to `/auth` (middleware)                                                            |

With the flag OFF every row is a real 404, except `/admin/atletas/` for an
app admin (see section 6) and the public `/pase/{slug}/`, which is unchanged.

## 4. Files changed outside the program's own directories

Since the merge-base with `origin/main` (`6ff6eeef`), T-AV0 included. The
program's own directories (`app/atletas/`, `app/admin/atletas/`,
`app/api/atletas/`, `app/api/admin/atletas/`, `app/pase/verificar/`,
`lib/atletas/`, `lib/dal/athlete*`, `lib/dal/passDoor*`, `lib/qr/`, `lib/svg/`,
`lib/features/athlete*`, `lib/notify/`, `components/atletas/`,
`components/door/`, `e2e/av/`, `scripts/av-*`, `supabase/recon/`,
`supabase/migrations/82*`, `docs/T-AV*`) are excluded. Every file below is
shared with `main` and is a decision for the gate.

- **Pase flow (live on `main`, printed on posters):** `app/api/pase/route.ts`,
  `app/pase/[slug]/page.tsx`, `PaseForm.tsx`, `AthleteInviteChip.tsx`,
  `VoucherQr.tsx`, `app/pase/page.tsx`, `app/pase/PaseCatalogPlaceholder.tsx`,
  `lib/pase/consent.ts`, `lib/email/passLead.ts`. Flag off is proven identical
  by frozen tests (`route.flagoff.test.ts`, `route.test.ts`).
- **Email and push send paths (T-AV19 log mode):** `lib/email/*` (one Resend
  factory), `app/api/notifications/send/notificationHelpers.ts`, and the routes
  that send email (`notify-admin-signup`, `feedback/widget`,
  `one-off/sports-nudge`, `send-*`). Unset modes mean live, so `main` behaves
  as today.
- **Gating and shell:** `middleware.ts` (the athletes gate, gym roles, admin
  gate), `app/page.tsx` and `app/profile/page.tsx` (entry cards),
  `app/dashboard/partner/page.tsx` (entry card), `app/api/features/athlete-value/route.ts`.
- **i18n:** `messages/en.json`, `messages/es.json`, `lib/i18n/translate.ts`,
  `lib/i18n/i18nGuards.test.ts` (placeholder strip), `lib/translationExtras.ts`.
- **Repo and tooling:** `package.json`, `package-lock.json` (qrcode-generator
  2.0.4, server-only 0.0.1, scripts), `playwright.config.ts` (ignores `e2e/av`),
  `playwright.av.config.ts`, `tsconfig.json`, `.gitignore`, `.githooks/*`,
  `.env.av.example`, `supabase/config.toml`, `supabase/.gitignore`,
  `supabase/verify-migration-state.sql`, `supabase/avGrantParity*`,
  `supabase/avMigrationCheck*`, `supabase/migrationImmutability.test.ts`,
  `supabase/tav22ClaimPolicy.test.ts`, `lib/testing/sourceWithoutComments.ts`,
  `scripts/avSessionCookie.mjs`, `scripts/avLocalDb.mjs`, `scripts/envFile.mjs`,
  `docs/ATHLETE_VALUE_MERGE_GATE.md`, `docs/AV_LOCAL_STACK.md`.

Regenerate with
`git diff --name-only $(git merge-base origin/main athlete/main) athlete/main`.

## 5. Copy approval status

| Where                           | Keys                                                | EN                                                                                                       | ES                                                        |
| ------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `messages/*.json` `door`        | 24                                                  | approved (Al, T-AV21, T-AV25)                                                                            | as proposed in recon 5.2                                  |
| `messages/*.json` `athleteHome` | 47                                                  | approved (T-AV24 and its polish)                                                                         | as proposed in recon 5.3; emotional line approved         |
| `messages/*.json` `gym`         | 61                                                  | approved (recon 5.4, spec 7.2, T-AV26 decision 4 with Al's `settingsPromoteAt` wording, T-AV27a's three) | as proposed                                               |
| `messages/*.json` `notify`      | 4                                                   | approved (T-AV27b, all five events)                                                                      | as proposed                                               |
| `messages/*.json` `email`       | 2                                                   | approved (T-AV27b)                                                                                       | as proposed; the email itself is Spanish only             |
| `messages/*.json` `admin`       | 6                                                   | approved (recon 5.5 plus `empty`)                                                                        | as proposed; "patrocinado" allowed on this screen only    |
| Pass page, Spanish only         | chip "Te invita {firstName}", voucher line, consent | n/a                                                                                                      | approved (T-AV23, D12; consent reworded in T-AV27a by Al) |

The recon's string table (`docs/T-AV20_RECON.md` section 5) is kept as it was
proposed. Where copy changed later (consent in T-AV27a, `settingsPromoteAt` in
T-AV26), this table and the code are authoritative.

## 6. Recorded on purpose

**The pass page stays Spanish only.** `/pase/{slug}/` was Spanish only before
this program and stays so (Al, T-AV27 decision 3): the "Te invita" chip, the
voucher line and the consent sentences are Spanish strings in code, not
`messages/*.json` keys. The consent sentences are stored in
`pass_leads.consent_text`, so they are records, not UI copy, and stay
constants in `lib/pase/consent.ts`. T-AV27 found no inline language ternaries
left in the T-AV21 or T-AV23 files; nothing was moved.

**App admins reach `/admin/atletas/` with the athletes flag off.** Spec
section 3 makes app admins always on for signed-in surfaces, and the admin
screen is one. Measured: with the flag off an admin gets 200 there, while an
owner gets a real 404 (`t-av27b-proof` test 1, `e2e/av/flagoff.spec.ts`).
Every other program surface is a real 404 with the flag off, admins included
only where section 3 says so.

**Pre-existing: the email tests fail when `.env.av.local` is loaded.** With
`EMAIL_MODE=log` in the environment, the Resend factory returns its logging
client, so every test that mocks the Resend SDK sees no call and fails. This
is true of `main`'s own `lib/email/passLead.replyTo.test.ts` too. The suite is
green because vitest does not load that file; a driver that sources it must
run unit tests with a clean environment (`t-av27b-mutations.LOCAL.sh` does,
after this made two of its arms vacuous on 2026-10-01). Worth fixing on its
own: the tests should pin `EMAIL_MODE` rather than inherit it.

**Two notes from the end-to-end run.** The door's notify call is fire and
forget; it now sends with `keepalive`, because the first end-to-end run lost
an "arrived" notification by closing the page right after the confirm, as a
coach moving on would. And React streams content into a hidden container
before swapping it in, so for a moment after "load" an element can exist
twice; the suite waits for the page to settle rather than matching hidden
copies. Neither is a defect in the pages.

## 7. What only the gate can do

See `docs/ATHLETE_VALUE_MERGE_GATE.md` section 8: the physical QR scan, a
real push to a device, the owner email in a real inbox, the send modes in
Vercel production, renumbering 8200 to 8209 against `origin/main`, D2, and the
real BullBox program row.
