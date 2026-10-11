#!/usr/bin/env bash
#
# t-grow2-rehearsal.LOCAL.sh -- run migration 215's rehearsal against a
# throwaway local Postgres modelled on production's pass_leads and referrals.
#
#   bash supabase/recon/t-grow1c-rehearsal.LOCAL.sh
#
# Four steps, each against a fresh copy of t-grow2-harness.LOCAL.sql:
#   1. the rehearsal: 24 arms inside BEGIN..ROLLBACK, then Part G's 5
#   2. the migration applied for real, TWICE (it claims to be re-runnable)
#   3. 215 probe from verify-migration-state.sql, which must read 'applied'
#   4. the rehearsal again on the migrated schema, where Part G must FAIL:
#      proof that Part G can see the columns it says are absent
#
# A green run means the SQL runs and the arms behave against this MODEL. It is
# not evidence about production; the live rehearsal is. Never run in CI, touches
# no remote database. Needs initdb, pg_ctl and psql on PATH.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HARNESS="$HERE/t-grow2-harness.LOCAL.sql"
MIGRATION="$REPO/supabase/migrations/215_t_grow2_referral_loop.sql"
REHEARSAL="$REPO/supabase/rehearsals/215_t_grow2_referral_loop_REHEARSAL.sql"
VERIFY="$REPO/supabase/verify-migration-state.sql"
PORT="${TGROW_PORT:-55437}"

for bin in initdb pg_ctl psql; do
  command -v "$bin" >/dev/null 2>&1 || { echo "FATAL: $bin not on PATH"; exit 2; }
done

SOCK="$(mktemp -d /tmp/tg2.XXXX)"
PGDATA="$SOCK/pgdata"
cleanup() { pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$SOCK"; }
trap cleanup EXIT

initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null
{ echo "unix_socket_directories = '$SOCK'"; echo "port = $PORT"; echo "listen_addresses = ''"; } >> "$PGDATA/postgresql.conf"
pg_ctl -D "$PGDATA" -l "$SOCK/pg.log" start >/dev/null
sleep 2
psql() { command psql -h "$SOCK" -p "$PORT" -U postgres -d postgres "$@"; }
fresh() {
  psql -Atc "drop schema public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null
  psql -v ON_ERROR_STOP=1 -q -f "$HARNESS" >/dev/null
}

rc=0

echo "== 1. rehearsal on the pre-migration model"
fresh
out="$(psql -v ON_ERROR_STOP=1 -f "$REHEARSAL" 2>&1 || true)"
printf '%s\n' "$out" | grep -E '\| (PASS|FAIL) ' || true
pass="$(printf '%s' "$out" | grep -c '| PASS' || true)"
fail="$(printf '%s' "$out" | grep -c '| FAIL' || true)"
stated="$(grep -oE 'Every row must read PASS\. [0-9]+ of [0-9]+' "$REHEARSAL" | grep -oE '[0-9]+ of [0-9]+')"
echo "PASS=$pass FAIL=$fail (states $stated, plus Part G's 5)"
if printf '%s' "$out" | grep -q 'ERROR:'; then printf '%s\n' "$out" | grep -E 'ERROR:|CONTEXT:' ; rc=1; fi
[ "$fail" = "0" ] && [ "$pass" = "$(( ${stated%% *} + 5 ))" ] || rc=1

echo "== 1b. 215's probe on the PRE-migration model must read MISSING, not error"
fresh
pre_probe="$(python3 - "$VERIFY" <<'PY2'
import sys
s = open(sys.argv[1]).read()
start = s.index("select '215_t_grow2_referral_loop'")
print(s[start:s.index("\norder by migration;", start)] + ';')
PY2
)"
pre="$(psql -Atc "$pre_probe" 2>&1 | cut -d'|' -f2)"
echo "probe before 215: $pre"
case "$pre" in MISSING*) ;; *) rc=1 ;; esac

echo "== 2. the migration applied twice"
for n in 1 2; do
  if psql -v ON_ERROR_STOP=1 -q -f "$MIGRATION" >/dev/null 2>"$SOCK/apply.err"; then echo "apply $n: ok"
  else echo "apply $n: FAILED"; cat "$SOCK/apply.err"; rc=1; fi
done

echo "== 3. 215's verifier probe"
probe="$(python3 - "$VERIFY" <<'PY'
import sys
s = open(sys.argv[1]).read()
start = s.index("select '215_t_grow2_referral_loop'")
end = s.index("\norder by migration;", start)
print(s[start:end] + ';')
PY
)"
verdict="$(psql -Atc "$probe" | cut -d'|' -f2)"
echo "probe: $verdict"
[ "$verdict" = "applied" ] || rc=1

echo "== 4. Part G on the MIGRATED model must fail (it can see what it checks)"
out="$(psql -f "$REHEARSAL" 2>&1 || true)"
if printf '%s' "$out" | grep -qE '\| FAIL +\| G1 pass_leads has no lead_ref_code'; then echo "G1 fails on the migrated schema: ok"
else echo "G1 did NOT fail on a migrated schema -- Part G is blind"; rc=1; fi

[ "$rc" = 0 ] && echo "ALL GREEN (local model only)" || echo "RED"
exit "$rc"
