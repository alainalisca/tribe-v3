#!/bin/sh
# Runs a T-AV migration's rehearsal against the LOCAL stack, inside one
# transaction that ends in ROLLBACK. Applies nothing.
#
#   scripts/av-rehearse.sh 8000_t_av2_canonical_attendance
#   scripts/av-rehearse.sh <rehearsal> <migration> [<migration> ...]
#
# With one argument the rehearsal and the migration share a name. With more,
# the first names the rehearsal and the rest are the migrations it needs, in
# order (a stacked ticket that reads an earlier ticket's tables), joined into
# one body.
#
# T-AV migrations carry their own BEGIN and COMMIT. Included inside a
# rehearsal's outer transaction, that COMMIT would persist everything before it
# on a stack other sessions share. This writes a copy with exactly those two
# lines removed, refuses if any top-level COMMIT or ROLLBACK survives, and hands
# the copy to the rehearsal as :body. The rehearsal also checks the transaction
# id did not change across the body (its arm T0).
set -eu
name="$1"
shift
[ "$#" -gt 0 ] || set -- "$name"
root="$(cd "$(dirname "$0")/.." && pwd)"
reh="$root/supabase/rehearsals/${name}_REHEARSAL.sql"
container="${AV_DB_CONTAINER:-supabase_db_tribe-v3-athlete}"
[ -f "$reh" ] || { echo "no rehearsal $reh" >&2; exit 1; }

tmp="$(mktemp -d)"
: > "$tmp/body.sql"
for m in "$@"; do
  mig="$root/supabase/migrations/$m.sql"
  [ -f "$mig" ] || { echo "no migration $mig" >&2; exit 1; }
  grep -v -x -e 'BEGIN;' -e 'COMMIT;' "$mig" >> "$tmp/body.sql"
done
if grep -q -i -x -e 'COMMIT;' -e 'ROLLBACK;' "$tmp/body.sql"; then
  echo "REFUSED: $name still has a top-level COMMIT or ROLLBACK after stripping" >&2
  exit 1
fi

docker exec "$container" rm -rf /tmp/av-rehearse
docker exec "$container" mkdir -p /tmp/av-rehearse
docker cp "$tmp/body.sql" "$container:/tmp/av-rehearse/body.sql" >/dev/null
docker cp "$reh" "$container:/tmp/av-rehearse/rehearsal.sql" >/dev/null
docker exec "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off \
  -v body=/tmp/av-rehearse/body.sql -f /tmp/av-rehearse/rehearsal.sql
