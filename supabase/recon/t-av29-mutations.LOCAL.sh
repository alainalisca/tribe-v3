#!/bin/bash
# T-AV29 mutation proofs, against the LOCAL stack.
#
#   bash supabase/recon/t-av29-mutations.LOCAL.sh
#
#   M1  the bug itself put back: the voucher QR from request.url's origin   -> proof test 1 RED
#   M2  the verify page's sign-in redirect drops returnTo                   -> proof test 2 RED
#   M3  sanitizeReturnTo lets a protocol-relative "//host" through          -> proof test 2 RED
#   U1  publicOrigin ignores NEXT_PUBLIC_SITE_URL                           -> publicOrigin.test.ts "the site URL wins" RED
#       (not the LAN case: there the Host header is the LAN address too, so
#       Host-first passes it; that case guards request.url, which M1 covers)
#
# Every arm asserts its edit landed and its restore landed, byte for byte.
# A proof that runs no test at all is reported as DID NOT RUN, never as a
# colour: two drivers on 2026-10-05 printed "0 pass, 0 fail" for a proof whose
# dev server never started, which reads like a result and is not one.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
TMP=$(mktemp -d)
ROUTE="app/api/pase/route.ts"
VERIFY="app/pase/verificar/[passCode]/page.tsx"
RETURN="lib/pendingReturnTo.ts"
ORIGIN="lib/http/publicOrigin.ts"
FILES=("$ROUTE" "$VERIFY" "$RETURN" "$ORIGIN")
orig_of() { echo "$TMP/$(echo "$1" | tr '/[]' '___')"; }
for f in "${FILES[@]}"; do cp "$f" "$(orig_of "$f")"; done
restore_all() { for f in "${FILES[@]}"; do cp "$(orig_of "$f")" "$f"; done; }
trap 'restore_all; rm -rf "$TMP"' EXIT

replace_once() { # replace_once <file> <old> <new>
  python3 - "$1" "$2" "$3" <<'PY' || return 1
import sys
p, old, new = sys.argv[1:]
s = open(p).read()
n = s.count(old)
if n != 1:
    print(f"  FATAL: the text to replace occurs {n} times in {p}, expected 1"); sys.exit(1)
open(p, 'w').write(s.replace(old, new, 1))
PY
}
landed() { cmp -s "$1" "$(orig_of "$1")" && { echo "  FATAL: $2 did not land"; exit 1; }; echo "  mutation landed ($1 differs)"; }
restore() { cp "$(orig_of "$1")" "$1"; cmp -s "$1" "$(orig_of "$1")" && echo "  restore landed ($1 equals the original)" || { echo "  FATAL: $2 restore did not land"; exit 1; }; }
all_ok=0
verdict() { # verdict <test> <RED|GREEN>
  ONLY="$1" bash supabase/recon/t-av29-proof.LOCAL.sh > "$TMP/out" 2>&1; rc=$?
  fails=$(grep -c '  FAIL ' "$TMP/out"); passes=$(grep -c '  PASS ' "$TMP/out")
  if [ $((passes + fails)) = 0 ]; then
    echo "  WRONG test $1: DID NOT RUN ($(grep -m1 -E 'FATAL|REFUSED' "$TMP/out" | cut -c1-100))"; all_ok=1; return
  fi
  if [ "$2" = RED ]; then [ "$rc" != 0 ] && [ "$fails" -gt 0 ] && got=RED || got=GREEN
  else [ "$rc" = 0 ] && [ "$fails" = 0 ] && got=GREEN || got=RED; fi
  first=""; [ "$fails" -gt 0 ] && first="  first failure: $(grep -m1 '  FAIL ' "$TMP/out" | sed 's/^ *FAIL *//' | cut -c1-110)"
  printf "  %-5s test %s: %s (%s pass, %s fail)%s\n" "$([ "$got" = "$2" ] && echo OK || echo WRONG)" "$1" "$got" "$passes" "$fails" "$first"
  [ "$got" = "$2" ] || all_ok=1
}
unit() { # unit <test file> <RED|GREEN> [name fragment]
  env -i PATH="$PATH" HOME="$HOME" NO_COLOR=1 npx vitest run "$1" --reporter=verbose > "$TMP/u.out" 2>&1; rc=$?
  if [ "$2" = RED ]; then
    hit=$(grep -E '^\s*×' "$TMP/u.out" | grep -F "$3" | head -1)
    [ "$rc" != 0 ] && [ -n "$hit" ] && echo "  OK    $1: \"$3\" RED" || { echo "  WRONG $1: \"$3\" not red"; all_ok=1; }
  else [ "$rc" = 0 ] && echo "  OK    $1: GREEN" || { echo "  WRONG $1: not green"; all_ok=1; }; fi
}

echo "== M1. the bug put back: the voucher QR from request.url's origin (test 1 must go RED)"
replace_once "$ROUTE" "renderVoucherQr(publicOrigin(request), inserted.passCode)" "renderVoucherQr(new URL(request.url).origin, inserted.passCode)" || exit 1
landed "$ROUTE" M1; verdict 1 RED; restore "$ROUTE" M1; verdict 1 GREEN

echo "== M2. the verify page's sign-in redirect drops returnTo (test 2 must go RED)"
replace_once "$VERIFY" 'redirect(`/auth?returnTo=${encodeURIComponent(back)}`);' "redirect('/auth'); void back;" || exit 1
landed "$VERIFY" M2; verdict 2 RED; restore "$VERIFY" M2

echo "== M3. sanitizeReturnTo lets \"//host\" through (test 2 must go RED)"
replace_once "$RETURN" "  if (value[1] === '/' || value[1] === '\\\\') return null;" "  if (value[1] === '\\\\') return null;" || exit 1
landed "$RETURN" M3; verdict 2 RED; restore "$RETURN" M3; verdict 2 GREEN

echo "== U1. publicOrigin ignores NEXT_PUBLIC_SITE_URL (unit)"
unit lib/http/publicOrigin.test.ts GREEN
replace_once "$ORIGIN" "  if (site) return site;" "  if (site) void site;" || exit 1
landed "$ORIGIN" U1; unit lib/http/publicOrigin.test.ts RED "the site URL wins"; restore "$ORIGIN" U1
unit lib/http/publicOrigin.test.ts GREEN

echo
[ "$all_ok" = 0 ] && echo "ALL ARMS BEHAVED; every edit and restore landed" || echo "SOME ARM DID NOT BEHAVE AS EXPECTED"
exit "$all_ok"
