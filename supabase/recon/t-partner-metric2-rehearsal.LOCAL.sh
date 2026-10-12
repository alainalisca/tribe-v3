#!/usr/bin/env bash
#
# t-partner-metric2-rehearsal.LOCAL.sh -- run migration 218's rehearsal against
# the 217 harness with 217 APPLIED (218's precondition).
#
#   bash supabase/recon/t-partner-metric2-rehearsal.LOCAL.sh
#
# Four steps, each against a fresh t-partner-metric1-harness.LOCAL.sql + 217:
#   1. the rehearsal: 11 arms inside BEGIN..ROLLBACK, then Part G's 3
#   2. the migration applied for real, TWICE (it claims to be re-runnable)
#   3. the 217 AND 218 probes from verify-migration-state.sql read 'applied'
#   4. Part G on the migrated schema must FAIL: proof that Part G can see what
#      it checks
#
# A green run means the SQL runs and the arms behave against this MODEL. It is
# not evidence about production; the live rehearsal is. Never run in CI, touches
# no remote database. Needs initdb, pg_ctl and psql on PATH.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HARNESS="$HERE/t-partner-metric1-harness.LOCAL.sql"
M217="$REPO/supabase/migrations/217_t_partner_metric1_increment_partner_metric.sql"
MIGRATION="$REPO/supabase/migrations/218_t_partner_metric2_revoke_anon.sql"
REHEARSAL="$REPO/supabase/rehearsals/218_t_partner_metric2_revoke_anon_REHEARSAL.sql"
VERIFY="$REPO/supabase/verify-migration-state.sql"
PORT="${TPM2_PORT:-55439}"

for bin in initdb pg_ctl psql; do
  command -v "$bin" >/dev/null 2>&1 || { echo "FATAL: $bin not on PATH"; exit 2; }
done

SOCK="$(mktemp -d /tmp/tpm2.XXXX)"
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
  psql -v ON_ERROR_STOP=1 -q -f "$M217" >/dev/null 2>&1
}

rc=0

echo "== 1. rehearsal on the pre-migration model"
fresh
out="$(psql -v ON_ERROR_STOP=1 -f "$REHEARSAL" 2>&1 || true)"
printf '%s\n' "$out" | grep -E '\| (PASS|FAIL) ' || true
pass="$(printf '%s' "$out" | grep -c '| PASS' || true)"
fail="$(printf '%s' "$out" | grep -c '| FAIL' || true)"
stated="$(grep -oE 'Every row must read PASS\. [0-9]+ of [0-9]+' "$REHEARSAL" | grep -oE '[0-9]+ of [0-9]+')"
echo "PASS=$pass FAIL=$fail (states $stated, plus Part G's 3)"
if printf '%s' "$out" | grep -q 'ERROR:'; then printf '%s\n' "$out" | grep -E 'ERROR:|CONTEXT:|LINE' ; rc=1; fi
[ "$fail" = "0" ] && [ "$pass" = "$(( ${stated%% *} + 3 ))" ] || rc=1

echo "== 2. the migration applied twice"
for n in 1 2; do
  if psql -v ON_ERROR_STOP=1 -q -f "$MIGRATION" >/dev/null 2>"$SOCK/apply.err"; then echo "apply $n: ok"
  else echo "apply $n: FAILED"; cat "$SOCK/apply.err"; rc=1; fi
done

echo "== 3. the 217 and 218 verifier probes"
for mig in 217_t_partner_metric1_increment_partner_metric 218_t_partner_metric2_revoke_anon; do
  probe="$(python3 - "$VERIFY" "$mig" <<'PY'
import sys
s = open(sys.argv[1]).read()
start = s.index("select '" + sys.argv[2] + "'")
nxt = s.find("\nunion all", start)
end = s.index("\norder by migration;", start)
print(s[start:(nxt if 0 <= nxt < end else end)] + ';')
PY
)"
  verdict="$(psql -Atc "$probe" | cut -d'|' -f2)"
  echo "probe $mig: $verdict"
  [ "$verdict" = "applied" ] || rc=1
done

echo "== 4. Part G on the MIGRATED model must fail (it can see what it checks)"
out="$(psql -f "$REHEARSAL" 2>&1 || true)"
if printf '%s' "$out" | grep -qE '\| FAIL +\| G1'; then echo "G1 fails on the migrated schema: ok"
else echo "G1 did NOT fail on a migrated schema -- Part G is blind"; rc=1; fi

[ "$rc" = 0 ] && echo "ALL GREEN (local model only)" || echo "RED"
exit "$rc"
