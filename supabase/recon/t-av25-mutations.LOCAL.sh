#!/bin/bash
# T-AV25 mutation proofs, against the LOCAL stack.
#
#   bash supabase/recon/t-av25-mutations.LOCAL.sh
#
#   M1  av_door_list's partner filter removed (database)  -> proof test 4 must go RED
#   M2  the verify page's fixed method map replaced by
#       passing ?via= through                              -> proof test 2 must go RED
#   M3  the code field's shape pre-check removed (unit):
#       "same message for unknown and other gym" stays GREEN (the RPC answers
#       both the same, so the pre-check is not what makes them equal), and
#       "not the pass shape: no request" goes RED (it is what saves the request)
#
# Every arm asserts its edit landed and its restore landed: a database
# function by the md5 of pg_get_functiondef, a source file byte for byte.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
PGURL="${AV_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$NEXT_PUBLIC_SUPABASE_URL" || { echo "REFUSED: API is not local"; exit 2; }
is_local "$PGURL" || { echo "REFUSED: Postgres is not local"; exit 2; }

q() { psql -X -v ON_ERROR_STOP=1 -At -d "$PGURL" -c "$1" < /dev/null; }
apply() { psql -X -v ON_ERROR_STOP=1 -q -d "$PGURL" -f "$1" < /dev/null > /dev/null; }
reload() { q "NOTIFY pgrst, 'reload schema';" > /dev/null; sleep 1; }
TMP=$(mktemp -d)

FN="public.av_door_list(uuid)"
md5fn() { q "select md5(pg_get_functiondef('$FN'::regprocedure))"; }
{ q "select pg_get_functiondef('$FN'::regprocedure)"; echo ';'; } > "$TMP/fn.orig.sql"
FN_ORIG=$(md5fn)
VERIFY="app/pase/verificar/[passCode]/page.tsx"
CODE="app/atletas/gym/[partnerId]/puerta/DoorCodeEntry.tsx"
cp "$VERIFY" "$TMP/verify.orig"; cp "$CODE" "$TMP/code.orig"
restore_all() { apply "$TMP/fn.orig.sql"; reload; cp "$TMP/verify.orig" "$VERIFY"; cp "$TMP/code.orig" "$CODE"; }
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
verdict() { # verdict <test> <RED|GREEN>
  ONLY="$1" bash supabase/recon/t-av25-proof.LOCAL.sh > "$TMP/out" 2>&1; rc=$?
  fails=$(grep -c '  FAIL ' "$TMP/out"); passes=$(grep -c '  PASS ' "$TMP/out")
  if [ "$2" = RED ]; then [ "$rc" != 0 ] && [ "$fails" -gt 0 ] && got=RED || got=GREEN
  else [ "$rc" = 0 ] && [ "$fails" = 0 ] && [ "$passes" -gt 0 ] && got=GREEN || got=RED; fi
  first=""; [ "$2" = RED ] && first="  first failure: $(grep -m1 '  FAIL ' "$TMP/out" | sed 's/^ *FAIL *//' | cut -c1-110)"
  [ "$2" = GREEN ] && [ "$got" = RED ] && first="  first failure: $(grep -m1 -E '  FAIL |FATAL|REFUSED' "$TMP/out" | cut -c1-110)"
  printf "  %-5s test %s: %s (%s pass, %s fail)%s\n" "$([ "$got" = "$2" ] && echo OK || echo WRONG)" "$1" "$got" "$passes" "$fails" "$first"
  [ "$got" = "$2" ]
}
all_ok=0

echo "== M1. av_door_list's partner filter removed (test 4 must go RED)"
cp "$TMP/fn.orig.sql" "$TMP/fn.mut.sql"
replace_once "$TMP/fn.mut.sql" "WHERE pl.partner_id = p_partner_id" "WHERE true" || exit 1
apply "$TMP/fn.mut.sql" && reload
[ "$(md5fn)" != "$FN_ORIG" ] && echo "  mutation landed (definition md5 changed)" || { echo "  FATAL: M1 did not land"; exit 1; }
verdict 4 RED || all_ok=1
apply "$TMP/fn.orig.sql" && reload
[ "$(md5fn)" = "$FN_ORIG" ] && echo "  restore landed (definition md5 equals the original)" || { echo "  FATAL: M1 restore did not land"; exit 1; }
verdict 4 GREEN || all_ok=1

echo "== M2. ?via= passed through instead of the fixed map (test 2 must go RED)"
replace_once "$VERIFY" "const method: ConfirmMethod = (via && METHOD_FROM_VIA[via]) || 'scan';" \
  "const method = (via || 'scan') as ConfirmMethod; void METHOD_FROM_VIA;" || exit 1
cmp -s "$VERIFY" "$TMP/verify.orig" && { echo "  FATAL: M2 did not land"; exit 1; }; echo "  mutation landed ($VERIFY differs)"
verdict 2 RED || all_ok=1
cp "$TMP/verify.orig" "$VERIFY"; cmp -s "$VERIFY" "$TMP/verify.orig" && echo "  restore landed ($VERIFY equals the original)" || { echo "  FATAL: M2 restore did not land"; exit 1; }
verdict 2 GREEN || all_ok=1

echo "== M3. the code field's shape pre-check removed (unit: same-answer GREEN, no-request RED)"
replace_once "$CODE" "    if (!PASS_CODE_SHAPE.test(normalized)) {" "    if (false && !PASS_CODE_SHAPE.test(normalized)) {" || exit 1
cmp -s "$CODE" "$TMP/code.orig" && { echo "  FATAL: M3 did not land"; exit 1; }; echo "  mutation landed ($CODE differs)"
NO_COLOR=1 npx vitest run "app/atletas/gym/[partnerId]/puerta/DoorList.test.tsx" --reporter=verbose > "$TMP/unit.out" 2>&1
same=$(grep -E "unknown and another gym's code" "$TMP/unit.out" | grep -c '✓'); noreq=$(grep -E "not the pass shape" "$TMP/unit.out" | grep -c '×')
[ "$same" = 1 ] && echo "  OK    same-answer test: GREEN under the mutation" || { echo "  WRONG same-answer test did not stay green"; all_ok=1; }
[ "$noreq" = 1 ] && echo "  OK    no-request test: RED under the mutation" || { echo "  WRONG no-request test did not go red"; all_ok=1; }
cp "$TMP/code.orig" "$CODE"; cmp -s "$CODE" "$TMP/code.orig" && echo "  restore landed ($CODE equals the original)" || { echo "  FATAL: M3 restore did not land"; exit 1; }
NO_COLOR=1 npx vitest run "app/atletas/gym/[partnerId]/puerta/DoorList.test.tsx" > "$TMP/unit2.out" 2>&1 && echo "  OK    DoorList tests green again" || { echo "  WRONG DoorList tests not green after restore"; all_ok=1; }

echo
[ "$all_ok" = 0 ] && echo "ALL ARMS BEHAVED; every edit and restore landed" || echo "SOME ARM DID NOT BEHAVE AS EXPECTED"
exit "$all_ok"
