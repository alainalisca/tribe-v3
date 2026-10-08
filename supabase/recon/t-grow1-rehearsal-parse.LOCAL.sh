#!/usr/bin/env bash
#
# t-grow1-rehearsal-parse.LOCAL.sh
#
# RUN THE THREE T-GROW1 REHEARSALS AGAINST A THROWAWAY POSTGRES, TO FIND THE
# SYNTAX ERRORS A PARSE CANNOT SEE.
#
# ═══════════════════════════════════════════════════════════════════════════
# WHY RUNNING AND NOT PARSING
# ═══════════════════════════════════════════════════════════════════════════
#
# 211's rehearsal failed in the Supabase SQL editor with 42601 at the
# featured_partners clone: `SELECT * FROM jsonb_populate_record(...) FROM
# public.featured_partners fp` has TWO FROM clauses, and the same statement was
# in all three files.
#
# Feeding the files to the Postgres parser would NOT have caught it. The
# statement lives inside a `DO $outer$ ... $$` block, and PL/pgSQL compiles a
# block's structure at creation while deferring the parse of each embedded SQL
# statement until that statement first EXECUTES. To the outer parser the whole
# body is one string literal.
#
# So the only check that works is execution, and execution needs a schema. That
# is t-grow1-harness.LOCAL.sql, and this script is the driver.
#
# ═══════════════════════════════════════════════════════════════════════════
# WHAT A GREEN RUN HERE DOES AND DOES NOT MEAN
# ═══════════════════════════════════════════════════════════════════════════
#
# DOES: every statement in the three files parses and runs, the migration bodies
# apply to an empty-ish schema, and all 36 / 35 / 31 arms report PASS.
#
# DOES NOT: say anything about production. The harness is a hand-built subset
# with stub functions and no real data, and it is FURTHER from production than a
# catalog read -- which CLAUDE.md's whole catalogue of findings is about the
# unreliability of. The live run is still the thing that decides, and it still
# needs Al's go.
#
# THE FIVE BUGS IT FOUND on 2026-10-08, every one of which would have failed on
# production too, and none of which any reader caught:
#   211 D1/D2  DROP COLUMN without CASCADE -- 211's own restrictive policy
#              depends on those columns, so the arm caught a 2BP01 dependency
#              error instead of the guard's message
#   211 D7     a LIKE pattern with four quotes instead of two, so it could never
#              match the message the guard had correctly raised
#   211 D8     REVOKE SELECT (one column) against a TABLE-level grant is a NO-OP,
#              so the arm never created the condition it tested: GUARD_DID_NOT_FIRE
#   212 B12    the detail string called av_can_work_door while SET ROLE
#              authenticated, which 201 revokes -- the arm reported a refusal of
#              its own detail as a refusal of the toggle
#   213 D8     assumed D7's mutation persisted; a plpgsql EXCEPTION block is a
#              SUBTRANSACTION, so D7's CREATE OR REPLACE was rolled back when its
#              guard fired
#
# And one bug in the HARNESS, which is worth as much: auth.uid() cast to jsonb
# before nullif, so the no-JWT arm hit 22P02 instead of reaching the function's
# `auth.uid() IS NULL` branch. A stub subtly unlike the thing it stands in for
# makes a correct test report a defect that does not exist.
#
# ═══════════════════════════════════════════════════════════════════════════
# USAGE
# ═══════════════════════════════════════════════════════════════════════════
#
#   bash supabase/recon/t-grow1-rehearsal-parse.LOCAL.sh
#
# Needs a local Postgres 14+ on PATH (initdb, pg_ctl, psql). Creates its cluster
# under a short mktemp path -- NOT the scratchpad, because a unix socket path is
# capped at 103 bytes and the scratchpad path alone is longer than that.
#
# .LOCAL.sh, like the other files in this directory: it is never run in CI, it
# touches no remote database, and it needs a Postgres that CI does not have.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HARNESS="$HERE/t-grow1-harness.LOCAL.sql"
PORT="${TGROW_PORT:-55433}"

REHEARSALS=(
  "211_t_grow1_lead_attribution"
  "212_t_grow1_lead_attended_toggle"
  "213_t_grow1_attribution_events"
)

for bin in initdb pg_ctl psql; do
  command -v "$bin" >/dev/null 2>&1 || { echo "FATAL: $bin not on PATH"; exit 2; }
done
[ -f "$HARNESS" ] || { echo "FATAL: harness missing at $HARNESS"; exit 2; }

SOCK="$(mktemp -d /tmp/tgrow.XXXX)"
PGDATA="$SOCK/pgdata"
# Always tear the cluster down, including on a failed arm: a stranded postgres
# on a fixed port is the thing that makes the NEXT run fail confusingly.
cleanup() {
  pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$SOCK"
}
trap cleanup EXIT

echo "cluster: $SOCK (port $PORT)"
initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null
{
  echo "unix_socket_directories = '$SOCK'"
  echo "port = $PORT"
  # No TCP at all. This cluster holds a throwaway schema and must not be
  # reachable from anything but this script.
  echo "listen_addresses = ''"
} >> "$PGDATA/postgresql.conf"
pg_ctl -D "$PGDATA" -l "$SOCK/pg.log" start >/dev/null
sleep 2

psql() { command psql -h "$SOCK" -p "$PORT" -U postgres -d postgres "$@"; }

rc=0
for name in "${REHEARSALS[@]}"; do
  file="$REPO/supabase/rehearsals/${name}_REHEARSAL.sql"
  [ -f "$file" ] || { echo "FATAL: $file missing"; exit 2; }

  # A FRESH SCHEMA PER REHEARSAL. 212 and 213 each apply 211's body as their
  # Part 0 prerequisite, so a shared schema would let one run's columns satisfy
  # the next run's A0 -- an arm passing on residue rather than on its own setup.
  psql -Atc "drop schema public cascade; create schema public; drop schema if exists auth cascade;" >/dev/null
  psql -v ON_ERROR_STOP=1 -q -f "$HARNESS" >/dev/null

  out="$(psql -v ON_ERROR_STOP=1 -f "$file" 2>&1 || true)"
  pass="$(printf '%s' "$out" | grep -c '| PASS' || true)"
  fail="$(printf '%s' "$out" | grep -c '| FAIL' || true)"
  # Anything psql reported as an error, including the 42601 this script exists
  # for. ON_ERROR_STOP means the first one aborts the file, so one is enough.
  errs="$(printf '%s' "$out" | grep -E 'ERROR:' || true)"

  # The total the file TELLS the operator to expect, parsed back out of it, so a
  # short result set cannot read as complete.
  stated="$(grep -oE 'Every row must read PASS\. [0-9]+ of [0-9]+' "$file" | grep -oE '[0-9]+ of [0-9]+' || echo '?')"

  printf '%-36s PASS=%-3s FAIL=%-3s  states: %s\n' "$name" "$pass" "$fail" "$stated"

  if [ -n "$errs" ]; then
    echo "  --- psql errors ---"
    printf '%s\n' "$errs" | sed 's/^/  /'
    rc=1
  fi
  if [ "$fail" -ne 0 ]; then
    echo "  --- failing arms ---"
    printf '%s' "$out" | grep '| FAIL' | sed 's/^/  /'
    rc=1
  fi
done

if [ "$rc" -eq 0 ]; then
  echo
  echo "All three ran clean: no psql errors and no FAIL arms."
  echo "This says the SQL is valid and the arms agree with each other."
  echo "It says NOTHING about production. The live rehearsal still decides."
else
  echo
  echo "Something failed above. Fix it before pasting anything into the SQL editor."
fi
exit "$rc"
