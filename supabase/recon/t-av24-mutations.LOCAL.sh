#!/bin/bash
# T-AV24 mutation proofs, end to end against the LOCAL stack.
#
#   bash supabase/recon/t-av24-mutations.LOCAL.sh
#
#   M1   BOTH "not active" link gates removed (the page's slug read and the
#        view model's linkActive)                          -> test 5 must go RED
#   M1a  only the page's gate removed: the view still refuses -> test 5 stays GREEN
#   M1b  only the view's gate removed: the page still refuses -> test 5 stays GREEN
#   M2   the raw RPC entry passed to the client alongside the view
#                                                           -> test 3 must go RED
#   M3   the middleware gate removed: flag-off status tests  -> T-AV24 test 1 and
#        T-AV21 test 11 must go RED (the pages alone stream a 200)
#   M4   only the /atletas/ page's own flag check removed   -> T-AV24 test 1 stays GREEN
#   M4b  only the door page's own flag check removed        -> T-AV21 test 11 stays GREEN
#
# The link gate is two layers on purpose (decision 1). As with 8207 in T-AV22,
# a guard held by two layers needs a mutation that removes both to show the
# test bites, and one per layer to show each holds alone.
#
# Each arm asserts its edit landed and its restore landed, byte for byte; the
# proof starts its own dev:av, so the edited code is what gets compiled.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$NEXT_PUBLIC_SUPABASE_URL" || { echo "REFUSED: API is not local"; exit 2; }

TMP=$(mktemp -d)
PAGE=app/atletas/page.tsx
VIEW=lib/atletas/athleteHomeView.ts
MW=middleware.ts
DOOR="app/pase/verificar/[passCode]/page.tsx"
FILES=("$PAGE" "$VIEW" "$MW" "$DOOR")
# Originals are kept under distinct names: two of these files are page.tsx.
orig() { echo "$TMP/$(echo "$1" | tr '/[]' '___').orig"; }
for f in "${FILES[@]}"; do cp "$f" "$(orig "$f")"; done
restore_all() { for f in "${FILES[@]}"; do cp "$(orig "$f")" "$f"; done; }
trap 'restore_all; rm -rf "$TMP"' EXIT

PAGE_GATE_OLD="isLinkActive(program) ? fetchPartnerSlug(supabase, program.partner_id) : Promise.resolve(null)"
PAGE_GATE_NEW="fetchPartnerSlug(supabase, program.partner_id)"
VIEW_GATE_OLD="const linkActive = isLinkActive(program) && extras.link !== null;"
VIEW_GATE_NEW="const linkActive = extras.link !== null;"
LEAK_OLD="return <AthleteHome view={toAthleteHomeView(program, { link, qrSvg, firstName, avatarUrl: profile.avatarUrl })} />;"
LEAK_NEW="return <AthleteHome view={{ ...toAthleteHomeView(program, { link, qrSvg, firstName, avatarUrl: profile.avatarUrl }), raw: program } as never} />;"

mutate() { # mutate <file> <old> <new>
  python3 - "$1" "$2" "$3" <<'PY' || return 1
import sys
p, old, new = sys.argv[1:]
s = open(p).read()
n = s.count(old)
if n != 1:
    print(f"  FATAL: the text to replace occurs {n} times in {p}, expected 1"); sys.exit(1)
open(p, 'w').write(s.replace(old, new, 1))
PY
  cmp -s "$1" "$(orig "$1")" && { echo "  FATAL: mutation did not land in $1"; return 1; }
  echo "  mutation landed ($1 differs from the original)"
}
restore() {
  for f in "$@"; do
    cp "$(orig "$f")" "$f"
    cmp -s "$f" "$(orig "$f")" && echo "  restore landed ($f equals the original)" || { echo "  FATAL: restore did not land"; return 1; }
  done
}
verdict() { # verdict <test> <RED|GREEN> [proof script, default T-AV24]
  ONLY="$1" bash "${3:-supabase/recon/t-av24-proof.LOCAL.sh}" > "$TMP/out" 2>&1; rc=$?
  fails=$(grep -c '  FAIL ' "$TMP/out"); passes=$(grep -c '  PASS ' "$TMP/out")
  if [ "$2" = RED ]; then [ "$rc" != 0 ] && [ "$fails" -gt 0 ] && got=RED || got=GREEN
  else [ "$rc" = 0 ] && [ "$fails" = 0 ] && [ "$passes" -gt 0 ] && got=GREEN || got=RED; fi
  first=""; [ "$2" = RED ] && first="  first failure: $(grep -m1 '  FAIL ' "$TMP/out" | sed 's/^ *FAIL *//' | cut -c1-110)"
  [ "$2" = GREEN ] && [ "$got" = RED ] && first="  first failure: $(grep -m1 -E '  FAIL |FATAL|REFUSED' "$TMP/out" | cut -c1-110)"
  printf "  %-5s %s test %s: %s (%s pass, %s fail)%s\n" "$([ "$got" = "$2" ] && echo OK || echo WRONG)" "$(basename "${3:-t-av24}" | cut -d- -f1-2)" "$1" "$got" "$passes" "$fails" "$first"
  [ "$got" = "$2" ]
}
all_ok=0

echo "== M1. both link gates removed (test 5 must go RED)"
mutate $PAGE "$PAGE_GATE_OLD" "$PAGE_GATE_NEW" && mutate $VIEW "$VIEW_GATE_OLD" "$VIEW_GATE_NEW" || exit 1
verdict 5 RED || all_ok=1
restore $PAGE $VIEW || exit 1
verdict 5 GREEN || all_ok=1

echo "== M1a. only the page's gate removed (test 5 must stay GREEN: the view still refuses)"
mutate $PAGE "$PAGE_GATE_OLD" "$PAGE_GATE_NEW" || exit 1
verdict 5 GREEN || all_ok=1
restore $PAGE || exit 1

echo "== M1b. only the view's gate removed (test 5 must stay GREEN: the page still refuses)"
mutate $VIEW "$VIEW_GATE_OLD" "$VIEW_GATE_NEW" || exit 1
verdict 5 GREEN || all_ok=1
restore $VIEW || exit 1

echo "== M2. the raw RPC entry handed to the client (test 3 must go RED)"
mutate $PAGE "$LEAK_OLD" "$LEAK_NEW" || exit 1
verdict 3 RED || all_ok=1
restore $PAGE || exit 1
verdict 3 GREEN || all_ok=1

MW_OLD="const gated = isAthletesGatedPath(pathname);"
MW_NEW="const gated = false; void isAthletesGatedPath;"
PAGE_FLAG="  await requireAthleteValuePage('athletes');"

echo "== M3. the middleware gate removed (both status tests must go RED)"
mutate "$MW" "$MW_OLD" "$MW_NEW" || exit 1
verdict 1 RED || all_ok=1
verdict 11 RED supabase/recon/t-av21-proof.LOCAL.sh || all_ok=1
restore "$MW" || exit 1
verdict 1 GREEN || all_ok=1
verdict 11 GREEN supabase/recon/t-av21-proof.LOCAL.sh || all_ok=1

echo "== M4. only the /atletas/ page's own flag check removed (T-AV24 test 1 must stay GREEN)"
mutate "$PAGE" "$PAGE_FLAG" "  // flag check removed by M4" || exit 1
verdict 1 GREEN || all_ok=1
restore "$PAGE" || exit 1

echo "== M4b. only the door page's own flag check removed (T-AV21 test 11 must stay GREEN)"
mutate "$DOOR" "$PAGE_FLAG" "  // flag check removed by M4b" || exit 1
verdict 11 GREEN supabase/recon/t-av21-proof.LOCAL.sh || all_ok=1
restore "$DOOR" || exit 1

echo
[ "$all_ok" = 0 ] && echo "ALL ARMS BEHAVED; every edit and restore landed" || echo "SOME ARM DID NOT BEHAVE AS EXPECTED"
exit "$all_ok"
