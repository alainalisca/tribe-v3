#!/bin/bash
# T-AV26 mutation proofs, against the LOCAL stack.
#
#   bash supabase/recon/t-av26-mutations.LOCAL.sh
#
# THE SETTINGS ROUTE HAS TWO LAYERS, so its owner check takes three arms
# (as 208 did in T-AV22): remove each alone and the coach is still refused,
# remove both and the coach's save lands.
#   S1  the route's role check removed (source)           -> proof test 5 stays GREEN (RLS refuses)
#   S2  the RLS UPDATE policy opened to any staff (db)    -> proof test 5 stays GREEN (the route refuses)
#   S3  both                                              -> proof test 5 goes RED (the coach's save lands)
#
# And one arm per other refusal this ticket relies on:
#   G1  middleware: settings needs only staff, not owner  -> proof test 2 RED (coach on /ajustes/ is no longer a real 404)
#   P1  partner_summary: v_full true for every role       -> proof test 4 RED (the coach payload carries bonus fields)
#   R1  search: the owner-or-admin check removed          -> proof test 6 RED (a coach can search)
#
# Every arm asserts its edit landed and its restore landed: a database object
# by the md5 of its definition, a source file byte for byte.
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

# ── captures, before anything is touched ───────────────────────────────────
POLICY='Owner or admin edits the program'
pol() { q "select qual || ' || ' || with_check from pg_policies where schemaname='public' and tablename='athlete_programs' and policyname='$POLICY'"; }
POL_QUAL=$(q "select qual from pg_policies where schemaname='public' and tablename='athlete_programs' and policyname='$POLICY'")
POL_CHECK=$(q "select with_check from pg_policies where schemaname='public' and tablename='athlete_programs' and policyname='$POLICY'")
POL_ORIG=$(pol)
[ -n "$POL_QUAL" ] && [ -n "$POL_CHECK" ] || { echo "FATAL: policy \"$POLICY\" not found"; exit 1; }
set_policy() { q "ALTER POLICY \"$POLICY\" ON public.athlete_programs USING ($1) WITH CHECK ($2)" > /dev/null; reload; }

fn_capture() { { q "select pg_get_functiondef('$1'::regprocedure)"; echo ';'; } > "$2"; }
md5fn() { q "select md5(pg_get_functiondef('$1'::regprocedure))"; }
SUM="public.av_athletes_partner_summary(uuid)"; SEARCH="public.av_athletes_search_candidates(uuid,text)"
fn_capture "$SUM" "$TMP/sum.orig.sql"; SUM_ORIG=$(md5fn "$SUM")
fn_capture "$SEARCH" "$TMP/search.orig.sql"; SEARCH_ORIG=$(md5fn "$SEARCH")

ROUTE="app/api/atletas/gym/[partnerId]/settings/route.ts"
GATE="lib/features/athleteValueGate.ts"
cp "$ROUTE" "$TMP/route.orig"; cp "$GATE" "$TMP/gate.orig"

restore_all() {
  set_policy "$POL_QUAL" "$POL_CHECK"
  apply "$TMP/sum.orig.sql"; apply "$TMP/search.orig.sql"; reload
  cp "$TMP/route.orig" "$ROUTE"; cp "$TMP/gate.orig" "$GATE"
}
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
  ONLY="$1" bash supabase/recon/t-av26-proof.LOCAL.sh > "$TMP/out" 2>&1; rc=$?
  fails=$(grep -c '  FAIL ' "$TMP/out"); passes=$(grep -c '  PASS ' "$TMP/out")
  if [ "$2" = RED ]; then [ "$rc" != 0 ] && [ "$fails" -gt 0 ] && got=RED || got=GREEN
  else [ "$rc" = 0 ] && [ "$fails" = 0 ] && [ "$passes" -gt 0 ] && got=GREEN || got=RED; fi
  first=""; [ "$fails" -gt 0 ] && first="  first failure: $(grep -m1 '  FAIL ' "$TMP/out" | sed 's/^ *FAIL *//' | cut -c1-110)"
  [ "$fails" = 0 ] && [ "$got" = RED ] && first="  $(grep -m1 -E 'FATAL|REFUSED' "$TMP/out" | cut -c1-110)"
  printf "  %-5s test %s: %s (%s pass, %s fail)%s\n" "$([ "$got" = "$2" ] && echo OK || echo WRONG)" "$1" "$got" "$passes" "$fails" "$first"
  [ "$got" = "$2" ]
}
landed_file() { cmp -s "$1" "$2" && { echo "  FATAL: $3 did not land"; exit 1; }; echo "  mutation landed ($1 differs)"; }
restored_file() { cmp -s "$1" "$2" && echo "  restore landed ($1 equals the original)" || { echo "  FATAL: $3 restore did not land"; exit 1; }; }
OPEN_ROLE='(av_my_partner_role(partner_id) IS NOT NULL)'
ROUTE_CHECK="if (callerRole === null || !OWNER_OR_ADMIN.includes(callerRole)) return notFound();"
ROUTE_GONE="void OWNER_OR_ADMIN; void callerRole;"
all_ok=0

echo "== S1. the route's role check removed; RLS alone (test 5 must stay GREEN)"
replace_once "$ROUTE" "$ROUTE_CHECK" "$ROUTE_GONE" || exit 1
landed_file "$ROUTE" "$TMP/route.orig" S1
verdict 5 GREEN || all_ok=1
cp "$TMP/route.orig" "$ROUTE"; restored_file "$ROUTE" "$TMP/route.orig" S1

echo "== S2. the RLS policy opened to any staff; the route alone (test 5 must stay GREEN)"
set_policy "$OPEN_ROLE" "$OPEN_ROLE"
[ "$(pol)" != "$POL_ORIG" ] && echo "  mutation landed (policy now: $(pol | cut -c1-80))" || { echo "  FATAL: S2 did not land"; exit 1; }
verdict 5 GREEN || all_ok=1

echo "== S3. both removed (test 5 must go RED: the coach's save lands)"
replace_once "$ROUTE" "$ROUTE_CHECK" "$ROUTE_GONE" || exit 1
landed_file "$ROUTE" "$TMP/route.orig" S3
verdict 5 RED || all_ok=1
cp "$TMP/route.orig" "$ROUTE"; restored_file "$ROUTE" "$TMP/route.orig" S3
set_policy "$POL_QUAL" "$POL_CHECK"
[ "$(pol)" = "$POL_ORIG" ] && echo "  restore landed (policy equals the original)" || { echo "  FATAL: policy restore did not land"; exit 1; }
verdict 5 GREEN || all_ok=1

echo "== G1. middleware: /ajustes/ needs only staff (test 2 must go RED)"
replace_once "$GATE" "return { partnerId, roles: isSettings ? OWNER_OR_ADMIN : STAFF };" \
  "return { partnerId, roles: isSettings ? STAFF : STAFF }; void OWNER_OR_ADMIN;" || exit 1
landed_file "$GATE" "$TMP/gate.orig" G1
verdict 2 RED || all_ok=1
cp "$TMP/gate.orig" "$GATE"; restored_file "$GATE" "$TMP/gate.orig" G1
verdict 2 GREEN || all_ok=1

echo "== P1. partner_summary gives every role the full payload (test 4 must go RED)"
cp "$TMP/sum.orig.sql" "$TMP/sum.mut.sql"
replace_once "$TMP/sum.mut.sql" "v_full := v_role IN ('owner', 'admin');" "v_full := true;" || exit 1
apply "$TMP/sum.mut.sql" && reload
[ "$(md5fn "$SUM")" != "$SUM_ORIG" ] && echo "  mutation landed (definition md5 changed)" || { echo "  FATAL: P1 did not land"; exit 1; }
verdict 4 RED || all_ok=1
apply "$TMP/sum.orig.sql" && reload
[ "$(md5fn "$SUM")" = "$SUM_ORIG" ] && echo "  restore landed (definition md5 equals the original)" || { echo "  FATAL: P1 restore did not land"; exit 1; }
verdict 4 GREEN || all_ok=1

echo "== R1. search without the owner-or-admin check (test 6 must go RED)"
cp "$TMP/search.orig.sql" "$TMP/search.mut.sql"
replace_once "$TMP/search.mut.sql" "IF v_role IS NULL OR v_role NOT IN ('owner', 'admin')" "IF false" || exit 1
apply "$TMP/search.mut.sql" && reload
[ "$(md5fn "$SEARCH")" != "$SEARCH_ORIG" ] && echo "  mutation landed (definition md5 changed)" || { echo "  FATAL: R1 did not land"; exit 1; }
verdict 6 RED || all_ok=1
apply "$TMP/search.orig.sql" && reload
[ "$(md5fn "$SEARCH")" = "$SEARCH_ORIG" ] && echo "  restore landed (definition md5 equals the original)" || { echo "  FATAL: R1 restore did not land"; exit 1; }
verdict 6 GREEN || all_ok=1

echo
[ "$all_ok" = 0 ] && echo "ALL ARMS BEHAVED; every edit and restore landed" || echo "SOME ARM DID NOT BEHAVE AS EXPECTED"
exit "$all_ok"
