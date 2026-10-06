#!/bin/bash
# T-AV21 mutation proofs (acceptance 9), against the LOCAL stack only.
#
#   bash supabase/recon/t-av21-mutations.LOCAL.sh
#
#   A. remove the partner check from av_can_work_door  -> test 3 must go RED
#   B. remove "attended_at IS NULL" from the claim policy AND drop the
#      restrictive policy (T-AV22, 208), every layer gone  -> test 6 must go RED
#
# Each arm: record the original, apply the mutation, ASSERT IT LANDED (a
# mutation that silently did not apply would report the guard as working),
# run the named test through t-av21-proof.LOCAL.sh, restore, ASSERT THE RESTORE
# LANDED, and run the test again to show it is green. A trap restores both on
# any exit, so an interrupted run cannot leave the local stack mutated.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
PGURL="${AV_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$NEXT_PUBLIC_SUPABASE_URL" || { echo "REFUSED: API is not local"; exit 2; }
is_local "$PGURL" || { echo "REFUSED: Postgres is not local"; exit 2; }

q() { psql -X -v ON_ERROR_STOP=1 -At -d "$PGURL" -c "$1" < /dev/null; }
reload() { q "NOTIFY pgrst, 'reload schema';" >/dev/null; sleep 1; }
PROOF="bash supabase/recon/t-av21-proof.LOCAL.sh"
TMP=$(mktemp -d)

FN_MD5="select md5(pg_get_functiondef('public.av_can_work_door(uuid)'::regprocedure))"
POLICY="select with_check from pg_policies where schemaname='public' and tablename='pass_leads' and policyname='Anyone can claim a pass'"
q "select pg_get_functiondef('public.av_can_work_door(uuid)'::regprocedure)" > "$TMP/fn.sql"
FN_ORIG=$(q "$FN_MD5")
POLICY_ORIG=$(q "$POLICY")
# The claim policy as it is LIVE, for the restore: not 201's text, which
# 204 superseded (see claim-policy.LOCAL.sh for what that cost).
apply() { psql -X -v ON_ERROR_STOP=1 -q -d "$PGURL" -f "$1" < /dev/null > /dev/null; }
. "$ROOT/supabase/recon/claim-policy.LOCAL.sh"
capture_claim_policy "$TMP/policy.sql" || exit 1
capture_server_only_policy "$TMP/server_only.sql" || exit 1
SO_ORIG=$(q "$SERVER_ONLY_POLICY_SQL")
grep -q '(attended_at IS NULL)' "$TMP/policy.sql" || { echo "FATAL: the live policy has no attended_at clause to mutate"; exit 1; }

restore_all() {
  psql -X -v ON_ERROR_STOP=1 -q -d "$PGURL" -f "$TMP/fn.sql" < /dev/null >/dev/null
  psql -X -v ON_ERROR_STOP=1 -q -d "$PGURL" -f "$TMP/policy.sql" < /dev/null >/dev/null
  apply "$TMP/server_only.sql"
  q "REVOKE ALL ON FUNCTION public.av_can_work_door(uuid) FROM public, anon, authenticated;" >/dev/null
  reload
}
trap 'restore_all; rm -rf "$TMP"' EXIT

verdict() { # verdict <arm> <test> <expect RED|GREEN>
  ONLY="$2" $PROOF > "$TMP/out" 2>&1; rc=$?
  fails=$(grep -c '  FAIL ' "$TMP/out"); passes=$(grep -c '  PASS ' "$TMP/out")
  if [ "$3" = RED ]; then [ "$rc" != 0 ] && [ "$fails" -gt 0 ] && got=RED || got=GREEN
  else [ "$rc" = 0 ] && [ "$fails" = 0 ] && [ "$passes" -gt 0 ] && got=GREEN || got=RED; fi
  printf "  %-5s test %s: %s (%s pass, %s fail)%s\n" "$([ "$got" = "$3" ] && echo OK || echo WRONG)" "$2" "$got" "$passes" "$fails" \
    "$([ "$3" = RED ] && echo "  first failure: $(grep -m1 '  FAIL ' "$TMP/out" | sed 's/^ *FAIL *//' | cut -c1-110)")"
  [ "$got" = "$3" ]
}
all_ok=0

echo "== A. partner check removed from av_can_work_door (test 3 must go RED)"
q "CREATE OR REPLACE FUNCTION public.av_can_work_door(p_partner_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS \$fn\$ SELECT auth.uid() IS NOT NULL AND p_partner_id IS NOT NULL; \$fn\$;" >/dev/null
reload
[ "$(q "$FN_MD5")" != "$FN_ORIG" ] && echo "  mutation landed (definition md5 changed)" || { echo "  FATAL: mutation A did not land"; exit 1; }
verdict A 3 RED || all_ok=1
psql -X -v ON_ERROR_STOP=1 -q -d "$PGURL" -f "$TMP/fn.sql" < /dev/null >/dev/null
q "REVOKE ALL ON FUNCTION public.av_can_work_door(uuid) FROM public, anon, authenticated;" >/dev/null
reload
[ "$(q "$FN_MD5")" = "$FN_ORIG" ] && echo "  restore landed (definition md5 equals the original)" || { echo "  FATAL: restore A did not land"; exit 1; }
verdict A 3 GREEN || all_ok=1

echo "== B. attended_at IS NULL removed from the claim policy AND the restrictive policy dropped (test 6 must go RED)"
sed 's/ AND (attended_at IS NULL)//' "$TMP/policy.sql" > "$TMP/policy_mut.sql"
cmp -s "$TMP/policy.sql" "$TMP/policy_mut.sql" && { echo "  FATAL: the sed matched nothing"; exit 1; }
[ -n "$SO_ORIG" ] || { echo "  FATAL: the restrictive policy is not there to drop"; exit 1; }
apply "$TMP/policy_mut.sql" && q "DROP POLICY \"Program columns are server only\" ON public.pass_leads;" >/dev/null
reload
[[ "$(q "$POLICY")" != *"attended_at IS NULL"* ]] && [ -z "$(q "$SERVER_ONLY_POLICY_SQL")" ] \
  && echo "  mutation landed (claim policy lost attended_at IS NULL; restrictive policy gone)" || { echo "  FATAL: mutation B did not land"; exit 1; }
verdict B 6 RED || all_ok=1
apply "$TMP/policy.sql" && apply "$TMP/server_only.sql"
reload
[ "$(q "$POLICY")" = "$POLICY_ORIG" ] && [ "$(q "$SERVER_ONLY_POLICY_SQL")" = "$SO_ORIG" ] \
  && echo "  restore landed (both policies equal their originals)" || { echo "  FATAL: restore B did not land"; exit 1; }
verdict B 6 GREEN || all_ok=1

echo
[ "$all_ok" = 0 ] && echo "ALL MUTATIONS CAUGHT; both restores landed; tests green again" || echo "SOME ARM DID NOT BEHAVE AS EXPECTED"
exit "$all_ok"
