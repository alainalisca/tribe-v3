#!/bin/bash
# T-AV22 mutation proofs (acceptance 10, plus the bonus_eligible arm Al added
# on 2026-09-29), against the LOCAL stack only.
#
#   bash supabase/recon/t-av22-mutations.LOCAL.sh
#
#   M1  partner check removed from av_athletes_set_outcome   -> test 10 must go RED
#   M2  attended_at requirement removed from set_outcome     -> test 6  must go RED
#   M3  athlete filter removed from av_athletes_my_summary   -> test 3  must go RED
#   M4  coach bonus-field exclusion removed (partner_summary)-> test 4  must go RED
#   M5  self-referral email match removed from the ledger    -> test 7  must go RED
#   M6  referred_by_athlete_id IS NULL removed from the claim policy AND the
#       restrictive policy (208) dropped: every layer gone  -> test 8  must go RED
#   M6b the clause removed from the claim policy ONLY: 208 still refuses
#       (the redundancy is deliberate, and this records it)  -> test 8  must stay GREEN
#   M7  bonus_eligible removed from the ledger's bonus owed  -> test 7  must go RED
#   M8  the restrictive 'server only' INSERT policy dropped (208) -> test 12 must go RED,
#       and test 8 must stay GREEN (the claim policy alone still refuses anon)
#
# Each arm: record the original, apply the mutation, ASSERT IT LANDED (the
# replaced text occurs exactly once, and the live definition's md5 changed),
# run the named test from t-av22-proof.LOCAL.sh, restore, ASSERT THE RESTORE
# LANDED (md5 equal to the original), and run the test again to show it is
# green. A trap restores everything on any exit.
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
PROOF="bash supabase/recon/t-av22-proof.LOCAL.sh"
TMP=$(mktemp -d)

FNS="av_athletes_set_outcome(text,text) av_athletes_my_summary() av_athletes_partner_summary(uuid) av_athletes_ledger(uuid)"
key() { echo "$1" | tr -c 'a-z0-9_\n' '_'; }
md5of() { q "select md5(pg_get_functiondef('public.$1'::regprocedure))"; }
for f in $FNS; do
  { q "select pg_get_functiondef('public.$f'::regprocedure)"; echo ';'; } > "$TMP/$(key "$f").orig.sql"
  eval "ORIG_$(key "$f")=\$(md5of \"\$f\")"
done
POLICY_SQL="select with_check from pg_policies where schemaname='public' and tablename='pass_leads' and policyname='Anyone can claim a pass'"
POLICY_ORIG=$(q "$POLICY_SQL")
# The claim policy as it is LIVE, for the restore (see claim-policy.LOCAL.sh:
# restoring from a migration file is how the T-AV21 driver reopened F2).
. "$ROOT/supabase/recon/claim-policy.LOCAL.sh"
capture_claim_policy "$TMP/policy.sql" || exit 1
grep -q '(referred_by_athlete_id IS NULL)' "$TMP/policy.sql" || { echo "FATAL: the live policy has no referred_by_athlete_id clause to mutate"; exit 1; }
capture_server_only_policy "$TMP/server_only.sql" || exit 1

restore_all() {
  for f in $FNS; do apply "$TMP/$(key "$f").orig.sql"; done
  apply "$TMP/policy.sql"
  apply "$TMP/server_only.sql"
  reload
}
trap 'restore_all; rm -rf "$TMP"' EXIT

# mutate_fn <signature> <old text> <new text>
mutate_fn() {
  { q "select pg_get_functiondef('public.$1'::regprocedure)"; echo ';'; } > "$TMP/cur.sql"
  python3 - "$TMP/cur.sql" "$2" "$3" <<'PY' || return 1
import sys
p, old, new = sys.argv[1:]
s = open(p).read()
n = s.count(old)
if n != 1:
    print(f"  FATAL: the text to replace occurs {n} times, expected 1: {old}"); sys.exit(1)
open(p, 'w').write(s.replace(old, new, 1))
PY
  apply "$TMP/cur.sql" && reload
  local v="ORIG_$(key "$1")"
  [ "$(md5of "$1")" != "${!v}" ] && echo "  mutation landed (definition md5 changed)" || { echo "  FATAL: mutation did not land"; return 1; }
}
restore_fn() {
  apply "$TMP/$(key "$1").orig.sql" && reload
  local v="ORIG_$(key "$1")"
  [ "$(md5of "$1")" = "${!v}" ] && echo "  restore landed (definition md5 equals the original)" || { echo "  FATAL: restore did not land"; return 1; }
}

verdict() { # verdict <test> <expect RED|GREEN>
  ONLY="$1" $PROOF > "$TMP/out" 2>&1; rc=$?
  fails=$(grep -c '  FAIL ' "$TMP/out"); passes=$(grep -c '  PASS ' "$TMP/out")
  if [ "$2" = RED ]; then [ "$rc" != 0 ] && [ "$fails" -gt 0 ] && got=RED || got=GREEN
  else [ "$rc" = 0 ] && [ "$fails" = 0 ] && [ "$passes" -gt 0 ] && got=GREEN || got=RED; fi
  first=""; [ "$2" = RED ] && first="  first failure: $(grep -m1 '  FAIL ' "$TMP/out" | sed 's/^ *FAIL *//' | cut -c1-100)"
  [ "$2" = GREEN ] && [ "$got" = RED ] && first="  first failure: $(grep -m1 -E '  FAIL |FATAL' "$TMP/out" | cut -c1-100)"
  printf "  %-5s test %s: %s (%s pass, %s fail)%s\n" "$([ "$got" = "$2" ] && echo OK || echo WRONG)" "$1" "$got" "$passes" "$fails" "$first"
  [ "$got" = "$2" ]
}
all_ok=0

arm_fn() { # arm_fn <label> <test> <signature> <old> <new>
  echo "== $1 (test $2 must go RED)"
  mutate_fn "$3" "$4" "$5" || exit 1
  verdict "$2" RED || all_ok=1
  restore_fn "$3" || exit 1
  verdict "$2" GREEN || all_ok=1
}

arm_fn "M1. partner check removed from av_athletes_set_outcome" 10 'av_athletes_set_outcome(text,text)' \
  'IF NOT FOUND OR NOT public.av_can_work_door(v_lead.partner_id) THEN' 'IF NOT FOUND THEN'
arm_fn "M2. attended_at requirement removed from av_athletes_set_outcome" 6 'av_athletes_set_outcome(text,text)' \
  "IF p_outcome = 'joined' AND v_lead.attended_at IS NULL THEN" 'IF false THEN'
arm_fn "M3. athlete filter removed from av_athletes_my_summary" 3 'av_athletes_my_summary()' \
  'WHERE l.program_athlete_id = v_pa.id;' 'WHERE true;'
arm_fn "M4. coach bonus-field exclusion removed from av_athletes_partner_summary" 4 'av_athletes_partner_summary(uuid)' \
  "v_full := v_role IN ('owner', 'admin');" 'v_full := true;'
arm_fn "M5. self-referral email match removed from av_athletes_ledger" 7 'av_athletes_ledger(uuid)' \
  "WHEN a.email_l = a.email_lower THEN 'self_email'" "WHEN false THEN 'self_email'"

sed 's/ AND (referred_by_athlete_id IS NULL)//' "$TMP/policy.sql" > "$TMP/policy_mut.sql"
cmp -s "$TMP/policy.sql" "$TMP/policy_mut.sql" && { echo "  FATAL: the sed matched nothing"; exit 1; }
SO_ORIG=$(q "$SERVER_ONLY_POLICY_SQL")
[ -n "$SO_ORIG" ] || { echo "  FATAL: the restrictive policy is not there to drop"; exit 1; }
restore_both() {
  apply "$TMP/policy.sql" && apply "$TMP/server_only.sql" && reload
  [ "$(q "$POLICY_SQL")" = "$POLICY_ORIG" ] && [ "$(q "$SERVER_ONLY_POLICY_SQL")" = "$SO_ORIG" ] \
    && echo "  restore landed (both policies equal their originals)" || { echo "  FATAL: $1 restore did not land"; exit 1; }
}

echo "== M6. clause removed from the claim policy AND the restrictive policy dropped (test 8 must go RED)"
apply "$TMP/policy_mut.sql" && q "DROP POLICY \"Program columns are server only\" ON public.pass_leads;" > /dev/null && reload
[[ "$(q "$POLICY_SQL")" != *"referred_by_athlete_id IS NULL"* ]] && [ -z "$(q "$SERVER_ONLY_POLICY_SQL")" ] \
  && echo "  mutation landed (claim policy lost the clause; restrictive policy gone)" || { echo "  FATAL: M6 did not land"; exit 1; }
verdict 8 RED || all_ok=1
restore_both M6
verdict 8 GREEN || all_ok=1

echo "== M6b. clause removed from the claim policy ONLY (test 8 must stay GREEN: 208 still refuses)"
apply "$TMP/policy_mut.sql" && reload
[[ "$(q "$POLICY_SQL")" != *"referred_by_athlete_id IS NULL"* ]] && [ "$(q "$SERVER_ONLY_POLICY_SQL")" = "$SO_ORIG" ] \
  && echo "  mutation landed (claim policy lost the clause; restrictive policy untouched)" || { echo "  FATAL: M6b did not land"; exit 1; }
verdict 8 GREEN || all_ok=1
restore_both M6b

arm_fn "M7. bonus_eligible removed from the ledger's bonus owed" 7 'av_athletes_ledger(uuid)' \
  'f.bonus_eligible IS TRUE AND f.bonus_settled_at IS NULL' 'f.bonus_settled_at IS NULL'

echo "== M8. the restrictive 'server only' INSERT policy dropped (test 12 must go RED, test 8 must stay GREEN)"
q "DROP POLICY \"Program columns are server only\" ON public.pass_leads;" > /dev/null && reload
[ -z "$(q "$SERVER_ONLY_POLICY_SQL")" ] && [ "$(q "$POLICY_SQL")" = "$POLICY_ORIG" ] \
  && echo "  mutation landed (the restrictive policy is gone; claim policy untouched)" || { echo "  FATAL: M8 did not land"; exit 1; }
verdict 12 RED || all_ok=1
verdict 8 GREEN || all_ok=1
apply "$TMP/server_only.sql" && reload
[ -n "$SO_ORIG" ] && [ "$(q "$SERVER_ONLY_POLICY_SQL")" = "$SO_ORIG" ] && echo "  restore landed (policy text equals the original)" || { echo "  FATAL: M8 restore did not land"; exit 1; }
verdict 12 GREEN || all_ok=1

echo
[ "$all_ok" = 0 ] && echo "ALL 9 ARMS BEHAVED; every restore landed; every test green again" || echo "SOME ARM DID NOT BEHAVE AS EXPECTED"
exit "$all_ok"
