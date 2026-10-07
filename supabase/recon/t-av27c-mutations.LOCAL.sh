#!/bin/bash
# T-AV27c mutation proofs, against the LOCAL stack.
#
#   bash supabase/recon/t-av27c-mutations.LOCAL.sh
#
#   J1  joined put back under the daily cap        -> proof test 1 RED (the join is not pushed)
#   J2  joined also skips the WEEKLY cap            -> proof test 2 RED (a fourth push in a week)
#   E1  the door confirm broken (source)            -> proof test 3 RED, and the Playwright report
#                                                      names the step "the coach opens the pass and
#                                                      confirms attendance"
#
# Every arm asserts its edit landed and its restore landed: the function by
# the md5 of its definition, the source file byte for byte.
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

CAP="public.av_push_allowed(uuid,text)"
md5fn() { q "select md5(pg_get_functiondef('$CAP'::regprocedure))"; }
{ q "select pg_get_functiondef('$CAP'::regprocedure)"; echo ';'; } > "$TMP/cap.orig.sql"; CAP_ORIG=$(md5fn)
VIEW="app/pase/verificar/[passCode]/DoorPassView.tsx"
cp "$VIEW" "$TMP/view.orig"
restore_all() { apply "$TMP/cap.orig.sql"; reload; cp "$TMP/view.orig" "$VIEW"; }
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
all_ok=0
verdict() { # verdict <test> <RED|GREEN>
  ONLY="$1" AV_E2E_LOG="$TMP/e2e.out" bash supabase/recon/t-av27c-proof.LOCAL.sh > "$TMP/out" 2>&1; rc=$?
  fails=$(grep -c '  FAIL ' "$TMP/out"); passes=$(grep -c '  PASS ' "$TMP/out")
  if [ "$2" = RED ]; then [ "$rc" != 0 ] && [ "$fails" -gt 0 ] && got=RED || got=GREEN
  else [ "$rc" = 0 ] && [ "$fails" = 0 ] && [ "$passes" -gt 0 ] && got=GREEN || got=RED; fi
  first=""; [ "$fails" -gt 0 ] && first="  first failure: $(grep -m1 '  FAIL ' "$TMP/out" | sed 's/^ *FAIL *//' | cut -c1-100)"
  [ "$fails" = 0 ] && [ "$got" = RED ] && first="  $(grep -m1 -E 'FATAL|REFUSED' "$TMP/out" | cut -c1-100)"
  printf "  %-5s test %s: %s (%s pass, %s fail)%s\n" "$([ "$got" = "$2" ] && echo OK || echo WRONG)" "$1" "$got" "$passes" "$fails" "$first"
  [ "$got" = "$2" ] || all_ok=1
}
cap_mutate() { # cap_mutate <old> <new> <name>
  cp "$TMP/cap.orig.sql" "$TMP/cap.mut.sql"; replace_once "$TMP/cap.mut.sql" "$1" "$2" || exit 1
  apply "$TMP/cap.mut.sql" && reload
  [ "$(md5fn)" != "$CAP_ORIG" ] && echo "  mutation landed (definition md5 changed)" || { echo "  FATAL: $3 did not land"; exit 1; }
}
cap_restore() {
  apply "$TMP/cap.orig.sql" && reload
  [ "$(md5fn)" = "$CAP_ORIG" ] && echo "  restore landed (definition md5 equals the original)" || { echo "  FATAL: $1 restore did not land"; exit 1; }
}

echo "== J1. joined put back under the daily cap (test 1 must go RED)"
cap_mutate "SELECT (p_event = 'joined'
          OR (SELECT count(*)" "SELECT (false
          OR (SELECT count(*)" J1
verdict 1 RED; cap_restore J1; verdict 1 GREEN

echo "== J2. joined also skips the weekly cap (test 2 must go RED)"
cap_mutate "     AND (SELECT count(*) FROM public.av_notification_log
           WHERE recipient_id = p_recipient AND push AND created_at > now() - interval '7 days') < 3;" \
  "     AND (p_event = 'joined' OR (SELECT count(*) FROM public.av_notification_log
           WHERE recipient_id = p_recipient AND push AND created_at > now() - interval '7 days') < 3);" J2
verdict 2 RED; cap_restore J2; verdict 2 GREEN

echo "== E1. the door confirm broken (test 3 must go RED at the confirm step)"
replace_once "$VIEW" "const result = await confirmPassAttendance(createClient(), passCode, method);" \
  "const result = await confirmPassAttendance(createClient(), 'ZZ-2345', method);" || exit 1
cmp -s "$VIEW" "$TMP/view.orig" && { echo "  FATAL: E1 did not land"; exit 1; }; echo "  mutation landed ($VIEW differs)"
export AV_E2E_ONLY=flag-on
verdict 3 RED
grep -q '› the coach opens the pass and confirms attendance' "$TMP/e2e.out" \
  && echo "  OK    the Playwright report names the failing step: the coach opens the pass and confirms attendance" \
  || { echo "  WRONG the report does not name the confirm step: $(grep -m2 -E '✘|›' "$TMP/e2e.out" | tr '\n' ' ' | cut -c1-160)"; all_ok=1; }
cp "$TMP/view.orig" "$VIEW"; cmp -s "$VIEW" "$TMP/view.orig" && echo "  restore landed ($VIEW equals the original)" || { echo "  FATAL: E1 restore did not land"; exit 1; }
unset AV_E2E_ONLY
verdict 3 GREEN

echo
[ "$all_ok" = 0 ] && echo "ALL ARMS BEHAVED; every edit and restore landed" || echo "SOME ARM DID NOT BEHAVE AS EXPECTED"
exit "$all_ok"
