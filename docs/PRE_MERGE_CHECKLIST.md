# Pre-merge checklist (feature/tribe-os → main)

Operational gate for merging Phase 2 work to `main`. Memory rule
`feedback_no_premature_merge_to_main` says don't merge without Al's
explicit ask. This file is the gate that decides whether to make that
ask.

## How to use

Walk every item top to bottom. Each gets `PASS`, `BLOCK`, or `NA`.
If any `BLOCK` exists, do not request the merge yet. After all
non-NA items are `PASS`, surface the checklist to Al for the merge
go-ahead.

## Gates

### Code health

- [ ] `npm run lint` is clean of new errors (warnings on `language === 'es'` ternaries are pre-existing tech debt and acceptable)
- [ ] `npx tsc --noEmit` returns no errors
- [ ] `npm run build` completes successfully with all new routes in the route table
- [ ] No unstaged `.env.local` or secret-bearing files in the working tree
- [ ] `git status` shows a clean tree (no leftover .bak files committed)

### Security

- [ ] `docs/SECURITY_AUDIT_2026-05-12.md` has all FIX items marked FIXED
- [ ] `node scripts/rls-leak-test.js` exits 0 (9/9 pass)
- [ ] Live Stripe webhook endpoint in production lists the 10 events (audit doc has the list)
- [ ] All Phase 2 routes use `requireTribeOSPremium()` where premium-gated, `isAdmin()` where admin-gated
- [ ] Service-role client creation in every route is preceded by an auth or admin gate

### Migrations

- [ ] Every migration `056` through latest is applied to the production Supabase project
- [ ] No `draft/*.draft.sql` files remain in the migrations directory unless explicitly out of scope
- [ ] Schema changes since `main`'s baseline are documented in `supabase/migrations/draft/README.md` promotion log

### Beta validation (the real gate)

- [ ] At least one real beta instructor has been onboarded and used the product for at least 3 days
- [ ] At least one real participant payment has flowed through Stripe Connect from a beta instructor's session
- [ ] `docs/BETA_LOG.md` has at least 3 daily entries showing actual usage
- [ ] No CRITICAL bugs from `docs/BETA_LOG.md` remain unfixed
- [ ] `docs/BETA_RETROSPECTIVE_YYYY-MM-DD.md` exists with all sections filled in

### Operational

- [ ] Verónica's Spanish review either complete OR explicitly accepted to ship with `// ES PENDING VERONICA REVIEW` markers in place (her edits land as a post-merge PR)
- [ ] Mobile real-device verification done per `docs/MOBILE_VERIFICATION.md` — no CRITICAL items unfixed
- [ ] Real refund test from `docs/LATER.md` executed and passing (Mission 2)
- [ ] `NEXT_PUBLIC_SITE_URL` in Vercel env points at the production URL (or custom domain if swap is done)
- [ ] `STRIPE_TRIBE_OS_PRICE_ID` in Vercel env points at the live Stripe price (not test)
- [ ] `STRIPE_SECRET_KEY` in Vercel env is the current `sk_live_` (not a rolled / invalidated value)

### Communication

- [ ] Al reviewed this checklist and explicitly said "merge it"
- [ ] If anyone is actively beta-testing, give them a heads-up before the merge so they know if anything changes
- [ ] PR description summarizes what shipped from `feature/tribe-os` (Weeks 1, 2, 3, 4 of Phase 2)

## After merge

- [ ] Delete the `feature/tribe-os` branch from the remote (`git push origin --delete feature/tribe-os`)
- [ ] Move all `LATER.md` items that are still relevant to a fresh `docs/WEEK_5_BACKLOG.md` (or wherever the next sprint's backlog lives)
- [ ] Archive `docs/SECURITY_AUDIT_2026-05-12.md` if a new audit run is scheduled
