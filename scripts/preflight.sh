#!/usr/bin/env bash
# scripts/preflight.sh
#
# Pre-merge health check. Run before merging feature/tribe-os to
# main:
#
#   bash scripts/preflight.sh
#
# Returns 0 if all checks pass, non-zero otherwise. Each check is
# annotated with what it proves and the failure mode you'd see in
# production if it didn't pass.
#
# Things this script CANNOT check (require human verification):
#   - Stripe env vars set in Vercel (open the dashboard)
#   - Production migration state (open Supabase SQL editor and
#     run supabase/verify-migration-state.sql)
#   - Spanish copy reviewed by Veronica
#
# Those live in the "manual checklist" at the bottom and the
# script prints them out at the end as a reminder.

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok() { printf "${GREEN}✓${NC} %s\n" "$1"; }
fail() { printf "${RED}✗${NC} %s\n" "$1"; exit 1; }
warn() { printf "${YELLOW}!${NC} %s\n" "$1"; }
info() { printf "  %s\n" "$1"; }

echo ""
echo "===================================="
echo "  Tribe.OS pre-merge preflight"
echo "===================================="
echo ""

# ── Working tree ─────────────────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  warn "Uncommitted changes detected:"
  git status --short
  echo ""
  warn "Continuing anyway, but consider committing or stashing first."
else
  ok "Working tree clean"
fi

# ── Branch ───────────────────────────────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "feature/tribe-os" ]; then
  warn "Currently on '${BRANCH}', not 'feature/tribe-os'."
  warn "Checks below run against the working tree regardless."
fi
ok "On branch: ${BRANCH}"

# ── TypeScript ──────────────────────────────────────────────────
info "Running tsc --noEmit (catches type errors Vercel build would also catch)..."
if ./node_modules/.bin/tsc --noEmit > /tmp/preflight-tsc.log 2>&1; then
  ok "tsc --noEmit: clean"
else
  cat /tmp/preflight-tsc.log
  fail "tsc --noEmit failed — Vercel build will reject this commit"
fi

# ── Lint ────────────────────────────────────────────────────────
info "Running ESLint (CI ceiling is 1850 warnings)..."
if npx eslint app/ lib/ components/ hooks/ --max-warnings 1850 > /tmp/preflight-lint.log 2>&1; then
  WARN_COUNT=$(grep -E "✖.*problems" /tmp/preflight-lint.log | grep -oE "[0-9]+ warnings" | grep -oE "[0-9]+" | head -1 || echo "0")
  ok "ESLint: ${WARN_COUNT} warnings (under 1850 ceiling)"
else
  cat /tmp/preflight-lint.log | tail -10
  fail "ESLint exceeded warning budget — fix some or raise the ceiling in CI"
fi

# ── Vitest ──────────────────────────────────────────────────────
info "Running vitest (unit + integration tests)..."
if npx vitest run > /tmp/preflight-test.log 2>&1; then
  TEST_COUNT=$(grep -E "Tests.*passed" /tmp/preflight-test.log | grep -oE "[0-9]+ passed" | head -1 || echo "0 passed")
  ok "vitest: ${TEST_COUNT}"
else
  tail -30 /tmp/preflight-test.log
  fail "vitest failed — fix red tests before merging"
fi

# ── Migration files ─────────────────────────────────────────────
LATEST_MIGRATION=$(ls supabase/migrations/0*.sql 2>/dev/null | sort | tail -1 | xargs -I{} basename {} .sql || echo "none")
ok "Latest migration file: ${LATEST_MIGRATION}"
info "Verify in Supabase SQL editor with supabase/verify-migration-state.sql"

# ── Commit counts (informational) ───────────────────────────────
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  AHEAD=$(git rev-list --count origin/main..HEAD)
  ok "Commits ahead of main: ${AHEAD}"
fi

echo ""
echo "===================================="
echo "  Automated checks complete"
echo "===================================="
echo ""

# ── Manual checklist ────────────────────────────────────────────
cat <<'EOF'
Manual checks (this script can't verify these — open the relevant
tab and confirm yourself):

  □ Stripe production env vars set in Vercel:
      - STRIPE_SECRET_KEY
      - STRIPE_WEBHOOK_SECRET
      - STRIPE_TRIBE_OS_PRICE_ID
      - (and any others your subscription routes reference)

  □ Migration state verified in Supabase SQL editor:
      Paste supabase/verify-migration-state.sql, confirm every
      migration row reads 'applied' (the 'cannot verify
      automatically' rows are permissions migrations — verify
      separately via pg_policies if forensically interested).

  □ Veronica's Spanish copy review signed off on the 5 highest-
    traffic surfaces:
      /os/dashboard, /os/members, /os/clients/[id],
      /os/audit, /my-coach

  □ Production has PostHog env vars set (NEXT_PUBLIC_POSTHOG_KEY
    + NEXT_PUBLIC_POSTHOG_HOST). Without these, server-side
    error tracking falls back to console-only.

  □ Tagged main for rollback:
      git tag v-pre-tribe-os-merge origin/main && git push --tags
      (so 'git reset --hard v-pre-tribe-os-merge' is a one-command
      revert if anything explodes in the first 24h)

  □ Ready to watch Vercel logs for the next 24 hours after merge.

When all checks above are green, merge with --no-ff to preserve
the feature branch history, then push to main.
EOF

echo ""
echo "Preflight passed. Run the manual checks above, then merge."
echo ""
