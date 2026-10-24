#!/usr/bin/env bash
#
# t-plan1-rehearsal.LOCAL.sh -- run migration 231's rehearsal against a
# throwaway local Postgres modelled on production's users, sessions and sessions_public.
#
#   bash supabase/recon/t-plan1-rehearsal.LOCAL.sh
#
# Five steps, each against a fresh copy of t-plan1-harness.LOCAL.sql:
#   1. the rehearsal: 33 arms inside BEGIN..ROLLBACK, then Part G's 5
#   2. the migration applied for real, TWICE (it claims to be re-runnable)
#   3. 231's probe from verify-migration-state.sql, which must read 'applied'
#   4. the rehearsal again on the migrated schema, where Part G must FAIL:
#      proof that Part G can see the columns it says are absent
#   5. the migration over a 158-shaped sessions_public (no is_test) must abort
#      at the pre-flight and leave nothing behind (added with the 231 renumber)
#
# A green run means the SQL runs and the arms behave against this MODEL. It is
# not evidence about production; the live rehearsal is. Never run in CI, touches
# no remote database. Needs initdb, pg_ctl and psql on PATH.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HARNESS="$HERE/t-plan1-harness.LOCAL.sql"
MIGRATION="$REPO/supabase/migrations/231_t_plan1_coach_plans.sql"
REHEARSAL="$REPO/supabase/rehearsals/231_t_plan1_coach_plans_REHEARSAL.sql"
VERIFY="$REPO/supabase/verify-migration-state.sql"
PORT="${TPLAN_PORT:-55435}"

for bin in initdb pg_ctl psql; do
  command -v "$bin" >/dev/null 2>&1 || { echo "FATAL: $bin not on PATH"; exit 2; }
done

SOCK="$(mktemp -d /tmp/tp1.XXXX)"
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

echo "== 2. the migration applied twice"
for n in 1 2; do
  if psql -v ON_ERROR_STOP=1 -q -f "$MIGRATION" >/dev/null 2>"$SOCK/apply.err"; then echo "apply $n: ok"
  else echo "apply $n: FAILED"; cat "$SOCK/apply.err"; rc=1; fi
done

echo "== 3. 231's verifier probe"
probe="$(python3 - "$VERIFY" <<'PY'
import sys
s = open(sys.argv[1]).read()
start = s.index("select '231_t_plan1_coach_plans'")
end = s.index("\norder by migration;", start)
print(s[start:end] + ';')
PY
)"
verdict="$(psql -Atc "$probe" | cut -d'|' -f2)"
echo "probe: $verdict"
[ "$verdict" = "applied" ] || rc=1

echo "== 4. Part G on the MIGRATED model must fail (it can see what it checks)"
out="$(psql -f "$REHEARSAL" 2>&1 || true)"
if printf '%s' "$out" | grep -qE 'G1 no coach_plan\* column .*\| FAIL|\| FAIL +\| G1'; then echo "G1 fails on the migrated schema: ok"
else echo "G1 did NOT fail on a migrated schema -- Part G is blind"; rc=1; fi

echo "== 5. the pre-flight refuses a sessions_public that is not 222's (158's shape, no is_test)"
fresh
psql -v ON_ERROR_STOP=1 -q >/dev/null <<'SQL'
DROP VIEW public.sessions_public;
CREATE VIEW public.sessions_public WITH (security_invoker = false) AS
SELECT s.id, s.title, s.sport, s.date, s.start_time, s.end_time, s.duration, s.description,
       s.equipment, s.skill_level, s.photos, s.max_participants, s.current_participants,
       s.waitlist_count, s.join_policy, s.status, s.is_paid, s.price_cents, s.currency,
       s.creator_id, u.name AS creator_name, u.avatar_url AS creator_avatar_url,
       u.average_rating AS creator_average_rating, s.location,
       round(s.latitude::numeric, 3) AS latitude, round(s.longitude::numeric, 3) AS longitude,
       round(s.location_lat::numeric, 3) AS location_lat, round(s.location_lng::numeric, 3) AS location_lng,
       s.partner_id, s.partner_status, s.partner_reviewed_at
  FROM public.sessions s LEFT JOIN public.users u ON u.id = s.creator_id
 WHERE s.join_policy IS DISTINCT FROM 'invite_only';
SQL
if psql -v ON_ERROR_STOP=1 -q -f "$MIGRATION" >/dev/null 2>"$SOCK/pre.err"; then
  echo "applied over a 158-shaped view -- the pre-flight is blind"; rc=1
elif grep -q "231 ABORTED: sessions_public is not 222's view" "$SOCK/pre.err" \
     && [ "$(psql -Atc "select count(*) from pg_attribute where attrelid='public.users'::regclass and attname like 'coach_plan%'")" = 0 ]; then
  echo "refused with the pre-flight message, nothing left behind: ok"
else echo "failed for another reason:"; cat "$SOCK/pre.err"; rc=1; fi

[ "$rc" = 0 ] && echo "ALL GREEN (local model only)" || echo "RED"
exit "$rc"
