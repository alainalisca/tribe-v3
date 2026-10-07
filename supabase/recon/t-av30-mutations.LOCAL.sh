#!/bin/bash
# T-AV30 mutation proofs, against the LOCAL stack.
#
#   bash supabase/recon/t-av30-mutations.LOCAL.sh
#
#   M1  the rehearsal bug put back: av_door_pass resolved with a literal
#       '...'::regprocedure                  -> proof test 1 RED (the verifier raises)
#                                               and verifyTavProbes.test.ts "literal reg* cast" RED
#   M2  the existence guard removed from 207 ("an athlete read function is
#       absent")                             -> proof test 1 RED (207 falls through
#                                               to 'applied' on a database without it)
#   U1  a T-AV object passed to has_function_privilege by name
#                                            -> verifyTavProbes.test.ts "by name" RED
#   S   after every restore: proof tests 1 and 2 GREEN (the success arm: the
#       restored verifier reads MISSING without and applied with)
#
# Every arm asserts its edit landed and its restore landed, byte for byte. A
# proof that runs no test at all is reported as DID NOT RUN, never as a colour.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
TMP=$(mktemp -d)
VERIFIER="supabase/verify-migration-state.sql"
UNIT="supabase/verifyTavProbes.test.ts"
cp "$VERIFIER" "$TMP/verifier.orig"
trap 'cp "$TMP/verifier.orig" "$VERIFIER"; rm -rf "$TMP"' EXIT

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
landed() { cmp -s "$VERIFIER" "$TMP/verifier.orig" && { echo "  FATAL: $1 did not land"; exit 1; }; echo "  mutation landed ($VERIFIER differs)"; }
restore() { cp "$TMP/verifier.orig" "$VERIFIER"; cmp -s "$VERIFIER" "$TMP/verifier.orig" && echo "  restore landed ($VERIFIER equals the original)" || { echo "  FATAL: $1 restore did not land"; exit 1; }; }
all_ok=0
verdict() { # verdict <tests> <RED|GREEN>
  ONLY="$1" bash supabase/recon/t-av30-proof.LOCAL.sh > "$TMP/out" 2>&1; rc=$?
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
unit() { # unit <RED|GREEN> [name fragment]
  env -i PATH="$PATH" HOME="$HOME" NO_COLOR=1 npx vitest run "$UNIT" --reporter=verbose > "$TMP/u.out" 2>&1; rc=$?
  if [ "$1" = RED ]; then
    hit=$(grep -E '^\s*×' "$TMP/u.out" | grep -F "$2" | head -1)
    [ "$rc" != 0 ] && [ -n "$hit" ] && echo "  OK    $UNIT: \"$2\" RED" || { echo "  WRONG $UNIT: \"$2\" not red"; all_ok=1; }
  else [ "$rc" = 0 ] && echo "  OK    $UNIT: GREEN" || { echo "  WRONG $UNIT: not green"; all_ok=1; }; fi
}

echo "== M1. the rehearsal bug put back: a literal ::regprocedure on av_door_pass (test 1 must go RED)"
replace_once "$VERIFIER" "pg_get_functiondef(to_regprocedure('public.av_door_pass(text)'))" "pg_get_functiondef('public.av_door_pass(text)'::regprocedure)" || exit 1
landed M1; verdict 1 RED; unit RED "literal reg* cast"; restore M1

echo "== M2. the existence guard removed from 207 (test 1 must go RED)"
replace_once "$VERIFIER" "         when exists (select 1 from unnest(array[
                        'public.av_athletes_my_summary()', 'public.av_athletes_partner_summary(uuid)',
                        'public.av_door_list(uuid)', 'public.av_door_pass(text)']) f(sig)
                       where to_regprocedure(f.sig) is null)
           then 'MISSING -- an athlete read function is absent'
" "" || exit 1
landed M2; verdict 1 RED; restore M2

echo "== U1. a T-AV object passed to has_function_privilege by name (unit)"
replace_once "$VERIFIER" "has_function_privilege('authenticated', to_regprocedure('public.av_can_work_door(uuid)'), 'EXECUTE')" "has_function_privilege('authenticated', 'public.av_can_work_door(uuid)', 'EXECUTE')" || exit 1
landed U1; unit RED "by name"; restore U1

echo "== S. the restored verifier: without reads MISSING, with reads applied"
verdict "1 2" GREEN; unit GREEN

echo
[ "$all_ok" = 0 ] && echo "ALL ARMS BEHAVED; every edit and restore landed" || echo "SOME ARM DID NOT BEHAVE AS EXPECTED"
exit "$all_ok"
