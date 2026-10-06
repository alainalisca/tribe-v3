#!/bin/bash
# T-AV30 acceptance proof: the verifier before and after the athlete
# migrations, LOCAL stack only.
#
#   bash supabase/recon/t-av30-proof.LOCAL.sh            # every test
#   ONLY="1" bash supabase/recon/t-av30-proof.LOCAL.sh   # a subset (the mutation driver uses this)
#
#   1  WITHOUT: the stack is reset to the production dump, which has none of
#      the T-AV objects. The scenario is checked before the verifier is
#      trusted (program_athletes, av_door_pass and av_notification_log must be
#      absent), then supabase/verify-migration-state.sql must run to the end
#      with ON_ERROR_STOP, return one row per T-AV migration, and every one of
#      those rows must read MISSING. This is the state production is in
#      between the merge and the pastes, and the state that crashed the
#      verifier in the 2026-10-06 merge rehearsal.
#   2  WITH: 8200 to 8209 applied in order (each must apply), then the same
#      verifier, and every T-AV row must read 'applied'.
#
# Every run ends with the stack as the proofs expect it: the T-AV migrations
# applied and `npm run av:seed` re-run (English, the default), whatever
# happened in between.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
PGURL="${AV_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$NEXT_PUBLIC_SUPABASE_URL" || { echo "REFUSED: API is not local"; exit 2; }
is_local "$PGURL" || { echo "REFUSED: Postgres is not local"; exit 2; }
q() { psql -X -v ON_ERROR_STOP=1 -At -d "$PGURL" -c "$1" < /dev/null; }
want() { [ -z "${ONLY:-}" ] || [[ " $ONLY " == *" $1 "* ]]; }
TMP=$(mktemp -d)
TAV_COUNT=$(grep -l '^-- PROGRAM: T-AV[[:space:]]*$' supabase/migrations/*.sql | wc -l | tr -d ' ')

reset_to_dump() {
  npm run db:reset < /dev/null > "$TMP/reset.out" 2>&1 || { echo "FATAL: db:reset failed"; tail -5 "$TMP/reset.out"; exit 1; }
}
apply_tav() { # apply 8200.. in number order; 0 when every file applied
  for f in supabase/migrations/82[0-9][0-9]_*.sql; do
    psql "$PGURL" -X -v ON_ERROR_STOP=1 -q -f "$f" < /dev/null > "$TMP/apply.out" 2>&1 || { echo "  apply failed: $f"; tail -3 "$TMP/apply.out"; return 1; }
  done
  q "NOTIFY pgrst, 'reload schema';" > /dev/null
}
verify() { # verify <outfile>; rc of the verifier, its rows in <outfile>
  psql "$PGURL" -X -At -F'|' -v ON_ERROR_STOP=1 -f supabase/verify-migration-state.sql < /dev/null > "$1" 2> "$1.err"
}
restore_stack() {
  if [ -z "$(q "select to_regclass('public.av_notification_log')")" ]; then
    reset_to_dump; apply_tav || echo "FATAL: could not re-apply the T-AV migrations; run docs/AV_LOCAL_STACK.md by hand"
  fi
  npm run av:seed < /dev/null > "$TMP/seed.out" 2>&1 || { echo "FATAL: av:seed failed"; tail -3 "$TMP/seed.out"; }
  rm -rf "$TMP"
}
trap restore_stack EXIT

pass=0; fail=0
ok()  { printf "  PASS  %s\n" "$1"; pass=$((pass+1)); }
bad() { printf "  FAIL  %s\n" "$1"; fail=$((fail+1)); }
[ "$TAV_COUNT" -gt 0 ] || { echo "FATAL: found no -- PROGRAM: T-AV migrations"; exit 1; }

reset_to_dump
echo "stack reset to the production dump; $TAV_COUNT T-AV migrations on disk"; echo

if want 1; then echo "== 1. WITHOUT the T-AV migrations: every T-AV row reads MISSING, nothing raises"
  absent=$(q "select (to_regclass('public.program_athletes') is null
                      and to_regprocedure('public.av_door_pass(text)') is null
                      and to_regclass('public.av_notification_log') is null)::text")
  if [ "$absent" != true ]; then
    bad "the scenario was not reproduced: T-AV objects exist after the reset ($absent)"
  else
    verify "$TMP/without.txt"; rc=$?
    rows=$(grep -cE '^[0-9]+_t_av' "$TMP/without.txt"); missing=$(grep -cE '^[0-9]+_t_av[a-z0-9_]*\|MISSING' "$TMP/without.txt")
    echo "  read: $(grep -E '^[0-9]+_t_av' "$TMP/without.txt" | cut -d'|' -f1,2 | cut -c1-60 | tr '\n' ';' | cut -c1-400)"
    if [ "$rc" = 0 ] && [ "$rows" = "$TAV_COUNT" ] && [ "$missing" = "$TAV_COUNT" ]; then
      ok "verifier ran to the end (rc 0); $missing of $TAV_COUNT T-AV rows read MISSING"
    else
      bad "rc $rc, $rows T-AV rows, $missing MISSING (want $TAV_COUNT); $(head -c 160 "$TMP/without.txt.err")"
    fi
  fi
fi

if want 2; then echo "== 2. WITH the T-AV migrations: every T-AV row reads applied"
  if ! apply_tav; then
    bad "8200 to 8209 did not apply"
  else
    verify "$TMP/with.txt"; rc=$?
    rows=$(grep -cE '^[0-9]+_t_av' "$TMP/with.txt"); applied=$(grep -cE '^[0-9]+_t_av[a-z0-9_]*\|applied$' "$TMP/with.txt")
    [ "$rc" = 0 ] && [ "$rows" = "$TAV_COUNT" ] && [ "$applied" = "$TAV_COUNT" ] \
      && ok "verifier ran to the end (rc 0); $applied of $TAV_COUNT T-AV rows read applied" \
      || bad "rc $rc, $rows T-AV rows, $applied applied (want $TAV_COUNT); $(grep -E '^[0-9]+_t_av' "$TMP/with.txt" | grep -v '|applied$' | head -2 | cut -c1-120) $(head -c 160 "$TMP/with.txt.err")"
  fi
fi

echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" = 0 ]
