#!/bin/bash
# T-AV27c acceptance proof, against the LOCAL stack (8200 to 8209, av:seed).
#
#   bash supabase/recon/t-av27c-proof.LOCAL.sh            # every test
#   ONLY="1" bash supabase/recon/t-av27c-proof.LOCAL.sh   # a subset (the mutation driver uses this)
#
#   1  joined skips the daily cap: a show-up and a join on the same day, BOTH
#      pushed (Al, 2026-10-01)
#   2  joined still counts toward the weekly 3: with three pushes this week
#      already, a join is in-app only
#   3  the Playwright suite, `npm run test:e2e:av`: the full loop and (T-AV29)
#      the scan-and-login return with the flag on, and the real 404s with it off
#
# Pushes are observed as in t-av27b-proof.LOCAL.sh: a throwaway CRON_SECRET
# and fake FCM tokens for this run only, and each "[push:log]" line the real
# /api/notifications/send writes in log mode is one push dispatched. Nothing
# leaves the machine. LOCAL ONLY.
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
. "$ROOT/supabase/recon/devServer.LOCAL.sh"
ID() { printf '00000000-0000-4000-8000-%012d' "$1"; }
CARO="$(ID 3)"
reset() {
  node scripts/av-seed-athletes.mjs < /dev/null > "$TMP/reset.out" 2>&1 || { echo "FATAL: seed reset failed"; cat "$TMP/reset.out"; exit 1; }
  q "delete from notifications where type like 'av\_%'; update users set fcm_token = null, fcm_platform = null where id = '$CARO';" > /dev/null
}
fresh() { reset; q "update users set fcm_token = 'proof-fake-token-' || id, fcm_platform = 'android' where id = '$CARO'" > /dev/null; }
cleanup() { stop_server; reset; rm -rf "$TMP"; }
if port_busy; then echo "REFUSED: something is already listening on $AV_PROOF_PORT; stop it first"; exit 2; fi
trap cleanup EXIT
reset
[ "$(q "select count(*) from pg_proc where proname='av_push_allowed' and pronargs=2")" = 1 ] || { echo "FATAL: 8209 is not the T-AV27c version"; exit 1; }
export CRON_SECRET="t-av27c-proof-$$"

c_elena=$(node scripts/avSessionCookie.mjs elena@av.local) || { echo "FATAL: no session for elena"; exit 1; }
j_elena=$(curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H 'Content-Type: application/json' -d '{"email":"elena@av.local","password":"tribe-local-1234"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
[ -n "$j_elena" ] || { echo "FATAL: no JWT for elena"; exit 1; }
rpc() { curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/$1" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $j_elena" -H 'Content-Type: application/json' -d "$2"; }
notify() { curl -s -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $c_elena" -H 'Content-Type: application/json' -d "{\"passCode\":\"$1\",\"event\":\"$2\"}" "$APP/api/atletas/notify/"; }
pushes() { grep -c '\[push:log\] channel=fcm' "$TMP/dev.log" 2>/dev/null || true; }
logged() { q "select coalesce(string_agg(event || '=' || push::text, ',' order by created_at), '') from av_notification_log where recipient_id = '$CARO'"; }

pass=0; fail=0
ok()  { printf "  PASS  %s\n" "$1"; pass=$((pass+1)); }
bad() { printf "  FAIL  %s\n" "$1"; fail=$((fail+1)); }

if want 1 || want 2; then start_server all; echo "dev:av up, flag=all"; echo; fi

if want 1; then echo "== 1. a show-up and a join on the same day: both pushed"
  fresh; p0=$(pushes)
  rpc av_confirm_pass_attendance '{"p_pass_code":"AV-CARA","p_method":"toggle"}' > /dev/null
  notify AV-CARA arrived > /dev/null; sleep 1
  rpc av_athletes_set_outcome '{"p_pass_code":"AV-CARA","p_outcome":"joined"}' > /dev/null
  notify AV-CARA joined > /dev/null; sleep 1
  [ "$(logged)" = "arrived=true,joined=true" ] && [ "$(( $(pushes) - p0 ))" = 2 ] \
    && ok "Caro: arrived and joined both pushed the same day ($(logged), 2 pushes)" || bad "joined priority: $(logged), pushes $(( $(pushes) - p0 ))"
  notify AV-CARB arrived > /dev/null; sleep 1
  [ "$(q "select push from av_notification_log where recipient_id='$CARO' and lead_id=(select id from pass_leads where pass_code='AV-CARB')")" = f ] \
    && ok "a second SHOW-UP the same day is still held to the daily cap" || bad "a second show-up was pushed"
fi

if want 2; then echo "== 2. a join still counts toward the weekly 3"
  fresh; p0=$(pushes)
  q "insert into av_notification_log (event, lead_id, program_athlete_id, recipient_id, push, created_at)
     select 'arrived', id, '$(ID 2003)'::uuid, '$CARO'::uuid, true, now() - interval '2 days' from pass_leads where pass_code in ('AV-CARB','AV-CARC','AV-CARD')" > /dev/null
  rpc av_confirm_pass_attendance '{"p_pass_code":"AV-CARA","p_method":"toggle"}' > /dev/null
  rpc av_athletes_set_outcome '{"p_pass_code":"AV-CARA","p_outcome":"joined"}' > /dev/null
  notify AV-CARA joined > /dev/null; sleep 1
  [ "$(q "select push from av_notification_log where event='joined'")" = f ] && [ "$(( $(pushes) - p0 ))" = 0 ] \
    && [ "$(q "select count(*) from notifications where recipient_id='$CARO' and type='av_joined'")" = 1 ] \
    && ok "three pushes this week: the join is in-app only, no push" || bad "weekly cap on joined: $(logged), pushes $(( $(pushes) - p0 ))"
  q "delete from av_notification_log where event='joined'; update av_notification_log set created_at = now() - interval '8 days'" > /dev/null
  [ "$(q "select public.av_push_allowed('$CARO', 'joined')")" = t ] && ok "with the week's pushes older than 7 days: allowed again (so the no above was the cap)" || bad "weekly cap stuck closed"
fi

if want 3; then echo "== 3. the Playwright suite (npm run test:e2e:av)"
  stop_server
  npm run test:e2e:av > "$TMP/e2e.out" 2>&1; rc=$?
  passed=$(grep -oE '[0-9]+ passed' "$TMP/e2e.out" | awk '{s+=$1} END {print s+0}')
  failed=$(grep -oE '[0-9]+ failed' "$TMP/e2e.out" | awk '{s+=$1} END {print s+0}')
  # 7 since T-AV29 added e2e/av/scanLogin.spec.ts (the QR scan and login return).
  [ "$rc" = 0 ] && [ "$passed" = 7 ] && [ "$failed" = 0 ] && ok "7 of 7: setup, the full loop and the scan-and-login return (flag on), four real-404 checks (flag off)" \
    || bad "e2e: rc $rc, $passed passed, $failed failed; first: $(grep -m1 -E '✘' "$TMP/e2e.out" | cut -c1-120)"
  cp "$TMP/e2e.out" "${AV_E2E_LOG:-/dev/null}" 2>/dev/null || true
fi

echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" = 0 ]
