#!/bin/bash
# T-AV27c. `npm run test:e2e:av`: the Tribe Athletes Playwright suite, against
# the LOCAL stack only (8200 to 8209, `npm run av:seed`).
#
#   npm run test:e2e:av                     # both projects
#   AV_E2E_ONLY=flag-on npm run test:e2e:av # one project (the mutation driver uses this)
#   AV_E2E_GREP='scans the voucher QR' ...   # only the matching tests (T-AV29)
#
# For each project it resets the seed, starts its own dev:av on the proof port
# (3101) with the athletes flag on or off, runs playwright.av.config.ts with
# AV_E2E_BASE_URL pointing at it, and stops the server it started. It refuses
# a non-local stack and a busy port, and leaves the seed as it found it.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
PGURL="${AV_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$NEXT_PUBLIC_SUPABASE_URL" || { echo "REFUSED: API is not local"; exit 2; }
is_local "$PGURL" || { echo "REFUSED: Postgres is not local"; exit 2; }
q() { psql -X -v ON_ERROR_STOP=1 -At -d "$PGURL" -c "$1" < /dev/null; }

TMP=$(mktemp -d)
. "$ROOT/supabase/recon/devServer.LOCAL.sh"
reset() {
  node scripts/av-seed-athletes.mjs < /dev/null > "$TMP/reset.out" 2>&1 || { echo "FATAL: seed reset failed"; cat "$TMP/reset.out"; exit 1; }
  # The loop claims a pass from 127.0.0.1, and /api/pase limits claims per IP.
  q "delete from notifications where type like 'av\_%'; delete from rate_limits where key like 'pase:%' or key like 'av_athletes_search:%';" > /dev/null
}
cleanup() { stop_server; reset; rm -rf "$TMP"; }
if port_busy; then echo "REFUSED: something is already listening on $AV_PROOF_PORT; stop it first"; exit 2; fi
trap cleanup EXIT
export CRON_SECRET="t-av27c-e2e-$$"

rc=0
run_project() { # run_project <project> <flag>
  reset
  start_server "$2"
  echo "== playwright project $1 (flag=$2) against $APP"
  # AV_E2E_GREP (T-AV29): run only the matching tests, for a proof that needs one spec.
  AV_E2E_BASE_URL="$APP" npx playwright test -c playwright.av.config.ts --project "$1" ${AV_E2E_GREP:+--grep "$AV_E2E_GREP"} || rc=1
}
case "${AV_E2E_ONLY:-both}" in
  flag-on) run_project flag-on all ;;
  flag-off) run_project flag-off off ;;
  *) run_project flag-on all; run_project flag-off off ;;
esac
exit "$rc"
