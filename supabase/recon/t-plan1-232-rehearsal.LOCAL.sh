#!/usr/bin/env bash
#
# t-plan1-232-rehearsal.LOCAL.sh -- run 232's rehearsal on a LOCAL Supabase
# stack that does not have 231 yet: 231's body (its BEGIN and COMMIT removed,
# so it joins the rehearsal's one transaction) is spliced in right after the
# rehearsal's BEGIN. Everything ends in the rehearsal's ROLLBACK; nothing
# persists. On a stack that already has 231, run the rehearsal file alone.
#
#   AV_DB_CONTAINER=supabase_db_tribe-v3-tpay2 bash supabase/recon/t-plan1-232-rehearsal.LOCAL.sh
#
# Never run against anything but a local container.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
C="${AV_DB_CONTAINER:-supabase_db_tribe-v3-tpay2}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
grep -v -x -e 'BEGIN;' -e 'COMMIT;' "$REPO/supabase/migrations/231_t_plan1_coach_plans.sql" > "$TMP/231.sql"
python3 -c '
import sys
reh, m231 = open(sys.argv[1]).read(), open(sys.argv[2]).read()
assert reh.count("\nBEGIN;\n") == 1 and reh.rstrip().endswith("ROLLBACK;")
open(sys.argv[3], "w").write(reh.replace("\nBEGIN;\n", "\nBEGIN;\n-- 231, spliced in by the LOCAL runner\n" + m231 + "\n", 1))
' "$REPO/supabase/rehearsals/232_t_plan1_account_scrub_coach_plans_REHEARSAL.sql" "$TMP/231.sql" "$TMP/run.sql"
docker cp "$TMP/run.sql" "$C:/tmp/reh232.sql" >/dev/null
docker exec "$C" psql -U postgres -d postgres -P pager=off -f /tmp/reh232.sql
