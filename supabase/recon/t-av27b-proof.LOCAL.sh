#!/bin/bash
# T-AV27b acceptance proof: log-mode notifications and the admin screen,
# against the LOCAL stack (8200 to 8209, av:seed), through a dev:av on the
# proof port.
#
#   bash supabase/recon/t-av27b-proof.LOCAL.sh            # every test
#   ONLY="9" bash supabase/recon/t-av27b-proof.LOCAL.sh   # a subset (the mutation driver uses this)
#
# HOW A PUSH IS OBSERVED WITHOUT SENDING ONE. The server is started with a
# throwaway CRON_SECRET, and the four people it can notify get a fake FCM
# token, both for this run only (cleared on exit, nothing committed). The
# route then goes through the REAL /api/notifications/send, which in log mode
# writes "[push:log] channel=fcm title=..." instead of calling FCM. Each such
# line in the dev log is one push the app dispatched. No push leaves the
# machine: the local stack forces log mode (lib/notify/sendMode).
#
# Seed: AV-CARA is Caro's credited guest, not yet arrived. AV-CARJ is Caro's
# self-referral (no credit). Ana is a captain at 9 of 10. Caro, Ana and the
# BullBox owner store preferred_language 'en'. LOCAL ONLY.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
API="$NEXT_PUBLIC_SUPABASE_URL"; ANON="$NEXT_PUBLIC_SUPABASE_ANON_KEY"
PGURL="${AV_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$API" || { echo "REFUSED: API is not local"; exit 2; }
is_local "$PGURL" || { echo "REFUSED: Postgres is not local"; exit 2; }

q() { psql -X -v ON_ERROR_STOP=1 -At -d "$PGURL" -c "$1" < /dev/null; }
want() { [ -z "${ONLY:-}" ] || [[ " $ONLY " == *" $1 "* ]]; }
TMP=$(mktemp -d)
. "$ROOT/supabase/recon/devServer.LOCAL.sh"
ID() { printf '00000000-0000-4000-8000-%012d' "$1"; }
PEOPLE="'$(ID 1)','$(ID 2)','$(ID 3)','$(ID 7)'"
TEMP_PARTNER_SLUG='prueba-temporal-t-av27b'
reset() {
  node scripts/av-seed-athletes.mjs < /dev/null > "$TMP/reset.out" 2>&1 || { echo "FATAL: seed reset failed"; cat "$TMP/reset.out"; exit 1; }
  q "delete from notifications where type like 'av\_%';
     delete from featured_partners where business_name = 'Prueba Temporal T-AV27b';
     update users set fcm_token = null, fcm_platform = null where id in ($PEOPLE);" > /dev/null
}
cleanup() { stop_server; reset; rm -rf "$TMP"; }
if port_busy; then echo "REFUSED: something is already listening on $AV_PROOF_PORT; stop it first"; exit 2; fi
trap cleanup EXIT
reset
PA=$(q "select id from featured_partners where user_id='$(ID 7)'")
PB=$(q "select id from featured_partners where user_id='$(ID 9)'")
[ -n "$PA" ] && [ -n "$PB" ] || { echo "FATAL: seed partners missing"; exit 1; }
[ "$(q "select count(*) from pg_proc where proname='av_athletes_claim_notification'")" = 1 ] || { echo "FATAL: 8209 is not applied"; exit 1; }
fake_tokens() { q "update users set fcm_token = 'proof-fake-token-' || id, fcm_platform = 'android' where id in ($PEOPLE)" > /dev/null; }
# Every test that counts rows or pushes starts from the seed, so no test sees
# another's notifications or spends another's daily push.
fresh() { reset; fake_tokens; }
export CRON_SECRET="t-av27b-proof-$$"

for who in admin bullbox elena gabi ana caro; do
  c=$(node scripts/avSessionCookie.mjs "$who@av.local") || { echo "FATAL: no session for $who"; exit 1; }
  eval "C_$who=\$c"
  t=$(curl -s -X POST "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$who@av.local\",\"password\":\"tribe-local-1234\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
  [ -n "$t" ] || { echo "FATAL: no JWT for $who"; exit 1; }
  eval "J_$who=\$t"
done
cookie() { local v="C_$1"; echo "${!v}"; }
jwt() { local v="J_$1"; echo "${!v}"; }
page() { curl -s -o "$TMP/p.html" -w '%{http_code}' -H "Cookie: $(cookie "$1")" "$APP$2"; }
rpc() { curl -s -X POST "$API/rest/v1/rpc/$2" -H "apikey: $ANON" -H "Authorization: Bearer $(jwt "$1")" -H 'Content-Type: application/json' -d "$3"; }
notify() { curl -s -o /dev/null -w '%{http_code}' -X POST -H "Cookie: $(cookie "$1")" -H 'Content-Type: application/json' -d "{\"passCode\":\"$2\",\"event\":\"$3\"}" "$APP/api/atletas/notify/"; }
admin_post() { curl -s -o "$TMP/a.json" -w '%{http_code}' -X POST -H "Cookie: $(cookie "$1")" -H 'Content-Type: application/json' -d "$2" "$APP/api/admin/atletas/"; }
inapp() { q "select count(*) from notifications where recipient_id='$1' and type='$2'"; }
inapp_msg() { q "select coalesce(string_agg(message, ' | '), '') from notifications where recipient_id='$1' and type='$2'"; }
pushes() { grep -c '\[push:log\] channel=fcm' "$TMP/dev.log" 2>/dev/null || true; }
settle() { sleep 1; }

pass=0; fail=0
ok()  { printf "  PASS  %s\n" "$1"; pass=$((pass+1)); }
bad() { printf "  FAIL  %s\n" "$1"; fail=$((fail+1)); }

if want 1; then
  start_server off; echo "dev:av up, flag=off"; echo
  echo "== 1. flag off: real 404s for everyone but an app admin (spec section 3: admins are always on)"
  c1=$(notify elena AV-CARB arrived); c2=$(page bullbox /admin/atletas/)
  c3=$(admin_post bullbox "{\"action\":\"set_active\",\"partnerId\":\"$PA\",\"active\":false}")
  [ "$c1" = 404 ] && [ "$c2" = 404 ] && [ "$c3" = 404 ] && [ "$(q "select is_active from athlete_programs where partner_id='$PA'")" = t ] \
    && ok "coach notify $c1, owner on the admin page $c2, owner on the admin route $c3, nothing changed" || bad "flag off: $c1 $c2 $c3"
  c=$(page admin /admin/atletas/)
  [ "$c" = 200 ] && ok "an app admin with the flag off: http $c, the always-on rule for signed-in surfaces" || bad "admin flag off: http $c"
fi

if want 2 || want 3 || want 4 || want 5 || want 6 || want 7 || want 8 || want 9 || want 10; then
  start_server all; echo; echo "dev:av up, flag=all"; echo
fi

if want 2; then echo "== 2. a credited show-up tells the athlete once: in-app and one push"
  fresh
  p0=$(pushes)
  rpc elena av_confirm_pass_attendance '{"p_pass_code":"AV-CARA","p_method":"toggle"}' > /dev/null
  c=$(notify elena AV-CARA arrived); settle
  [ "$c" = 200 ] && [ "$(inapp_msg "$(ID 3)" av_arrived)" = "Lucia arrived at class" ] && [ "$(( $(pushes) - p0 ))" = 1 ] \
    && ok "Caro: \"Lucia arrived at class\" in-app (her language, en), one push dispatched" || bad "arrived: http $c, in-app '$(inapp_msg "$(ID 3)" av_arrived)', pushes $(( $(pushes) - p0 ))"
  notify elena AV-CARA arrived > /dev/null; notify bullbox AV-CARA arrived > /dev/null; settle
  [ "$(inapp "$(ID 3)" av_arrived)" = 1 ] && [ "$(( $(pushes) - p0 ))" = 1 ] && ok "asked twice more (coach and owner): still one in-app row and one push" || bad "dedupe: $(inapp "$(ID 3)" av_arrived) rows"
fi

if want 3; then echo "== 3. an event that did not happen, or a guest who does not count, tells nobody"
  fresh
  p0=$(pushes)
  # AV-CARA is credited and has NOT arrived: only the event check stands between it and a notification.
  notify elena AV-CARA arrived > /dev/null; notify elena AV-CARA joined > /dev/null; settle
  [ "$(inapp "$(ID 3)" av_arrived)" = 0 ] && ok "a credited guest who has not arrived: nothing" || bad "arrived early: $(inapp "$(ID 3)" av_arrived)"
  [ "$(inapp "$(ID 3)" av_joined)" = 0 ] && ok "joined before any join: nothing" || bad "joined early: $(inapp "$(ID 3)" av_joined)"
  notify elena AV-CARM arrived > /dev/null; notify elena AV-CARJ arrived > /dev/null; settle
  [ "$(q "select count(*) from av_notification_log where lead_id in (select id from pass_leads where pass_code in ('AV-CARM','AV-CARJ'))")" = 0 ] && [ "$(( $(pushes) - p0 ))" = 0 ] \
    && ok "not arrived (AV-CARM) and a self-referral (AV-CARJ): no row, no push" || bad "uncredited or unhappened notified"
fi

if want 4; then echo "== 4. another gym's coach can name the pass and still tells nobody"
  fresh
  rpc elena av_confirm_pass_attendance '{"p_pass_code":"AV-CARA","p_method":"toggle"}' > /dev/null
  c=$(notify gabi AV-CARA arrived); settle
  [ "$c" = 200 ] && [ "$(inapp "$(ID 3)" av_arrived)" = 0 ] && ok "Gabi: http $c (the same quiet answer), no notification" || bad "Gabi notified: http $c rows $(inapp "$(ID 3)" av_arrived)"
fi

if want 5; then echo "== 5. the cap: max 1 T-AV push per athlete per day; over it, in-app only"
  fresh
  p0=$(pushes)
  rpc elena av_confirm_pass_attendance '{"p_pass_code":"AV-CARA","p_method":"toggle"}' > /dev/null
  notify elena AV-CARA arrived > /dev/null; settle
  rpc elena av_athletes_set_outcome '{"p_pass_code":"AV-CARA","p_outcome":"joined"}' > /dev/null
  notify elena AV-CARA joined > /dev/null; settle
  [ "$(inapp_msg "$(ID 3)" av_joined)" = "Lucia joined BullBox (Prueba)" ] && [ "$(( $(pushes) - p0 ))" = 1 ] \
    && [ "$(q "select push from av_notification_log where event='joined'")" = f ] \
    && ok "same day: \"Lucia joined BullBox (Prueba)\" in-app, push off, one push total" || bad "daily cap: pushes $(( $(pushes) - p0 )), in-app '$(inapp_msg "$(ID 3)" av_joined)'"
  q "update av_notification_log set created_at = now() - interval '2 days'" > /dev/null
  q "insert into av_notification_log (event, lead_id, program_athlete_id, recipient_id, push, created_at)
     select 'arrived', id, '$(ID 2003)'::uuid, '$(ID 3)'::uuid, true, now() - interval '3 days' from pass_leads where pass_code='AV-CARB'
     union all select 'arrived', id, '$(ID 2003)'::uuid, '$(ID 3)'::uuid, true, now() - interval '4 days' from pass_leads where pass_code='AV-CARC'" > /dev/null
  [ "$(q "select public.av_push_allowed('$(ID 3)')")" = f ] && ok "three pushes this week, none today: the weekly cap says no" || bad "weekly cap allowed a fourth"
  q "delete from av_notification_log where created_at < now() - interval '2 days 12 hours'" > /dev/null
  [ "$(q "select public.av_push_allowed('$(ID 3)')")" = t ] && ok "one push two days ago: allowed again (so the no above was the cap)" || bad "cap stuck closed"
fi

if want 6; then echo "== 6. a claim through an athlete's link tells the athlete in-app, with no push"
  fresh
  p0=$(pushes)
  body=$(python3 -c "
import json,time
print(json.dumps({'slug':'$(q "select slug from featured_partners where id='$PA'")','name':'Sofia Nueva','whatsapp':'+573005557702','email':'sofia.nueva@guest.local',
  'src':'atleta','code':'ANA-7KQ','consent':True,'website':'','t':int(time.time()*1000)-5000}))")
  c=$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X POST "$APP/api/pase/" -H 'content-type: application/json' -H 'x-forwarded-for: 10.27.2.1' -d "$body"); settle
  NEWCODE=$(python3 -c "import json;print(json.load(open('$TMP/r.json')).get('pass_code',''))")
  [ "$c" = 200 ] && [ "$(inapp_msg "$(ID 1)" av_claimed)" = "Sofia claimed a pass with your link" ] && [ "$(( $(pushes) - p0 ))" = 0 ] \
    && ok "Ana: \"Sofia claimed a pass with your link\" in-app, no push ($NEWCODE)" || bad "claimed: http $c in-app '$(inapp_msg "$(ID 1)" av_claimed)' pushes $(( $(pushes) - p0 ))"
  echo "$NEWCODE" > "$TMP/newcode"
fi

if want 7; then echo "== 7. the show-up that makes a captain ready tells the owner, once"
  p0=$(pushes)
  [ -s "$TMP/newcode" ] || bad "test 7 needs test 6's claim (run 6 7 together)"
  NEWCODE=$(cat "$TMP/newcode" 2>/dev/null)
  rpc elena av_confirm_pass_attendance "{\"p_pass_code\":\"$NEWCODE\",\"p_method\":\"toggle\"}" > /dev/null
  notify elena "$NEWCODE" arrived > /dev/null; settle
  [ "$(inapp_msg "$(ID 7)" av_ready)" = "Ana can move up a level" ] && [ "$(inapp "$(ID 1)" av_arrived)" = 1 ] && [ "$(( $(pushes) - p0 ))" = 2 ] \
    && ok "owner: \"Ana can move up a level\"; Ana: her arrival; two pushes" || bad "ready: owner '$(inapp_msg "$(ID 7)" av_ready)', ana arrived $(inapp "$(ID 1)" av_arrived), pushes $(( $(pushes) - p0 ))"
  notify bullbox "$NEWCODE" arrived > /dev/null; settle
  [ "$(inapp "$(ID 7)" av_ready)" = 1 ] && ok "asked again: the owner is told once" || bad "ready twice"
fi

if want 8; then echo "== 8. /admin/atletas: app admins only, a real 404 for everyone else"
  for r in "admin|200" "bullbox|404" "elena|404" "ana|404"; do
    IFS='|' read -r who want_c <<< "$r"; c=$(page "$who" /admin/atletas/)
    [ "$c" = "$want_c" ] && ok "$who: http $c" || bad "$who: http $c, want $want_c"
  done
  page admin /admin/atletas/ > /dev/null
  grep -q "BullBox (Prueba)" "$TMP/p.html" && grep -q "Otro Gym (Prueba)" "$TMP/p.html" && ok "the admin page lists both programs" || bad "admin page content"
  loc=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$APP/admin/atletas/")
  [[ "$loc" == 30[27]*"/auth"* ]] && ok "signed out: $loc" || bad "signed out: $loc"
fi

if want 9; then echo "== 9. only an app admin switches a program on or off, or creates one"
  fresh
  c=$(admin_post bullbox "{\"action\":\"set_active\",\"partnerId\":\"$PA\",\"active\":false}")
  [ "$c" = 404 ] && [ "$(q "select is_active from athlete_programs where partner_id='$PA'")" = t ] && ok "the owner switching their own program off: http $c, unchanged" || bad "owner set_active: http $c / $(q "select is_active from athlete_programs where partner_id='$PA'")"
  c=$(admin_post elena "{\"action\":\"set_active\",\"partnerId\":\"$PA\",\"active\":false}")
  [ "$c" = 404 ] && [ "$(q "select is_active from athlete_programs where partner_id='$PA'")" = t ] && ok "a coach: http $c, unchanged" || bad "coach set_active: http $c"
  c=$(admin_post admin "{\"action\":\"set_active\",\"partnerId\":\"$PB\",\"active\":true}")
  [ "$c" = 200 ] && [ "$(q "select is_active from athlete_programs where partner_id='$PB'")" = t ] && ok "the admin switches Otro Gym on: http $c" || bad "admin set_active: http $c $(cat "$TMP/a.json")"
  TP=$(q "insert into featured_partners (user_id, business_name, business_type, status) values ('$(ID 4)', 'Prueba Temporal T-AV27b', 'gym', 'active') returning id" | head -1)
  c=$(admin_post bullbox "{\"action\":\"create\",\"partnerId\":\"$TP\"}")
  [ "$c" = 404 ] && [ "$(q "select count(*) from athlete_programs where partner_id='$TP'")" = 0 ] && ok "a non-admin creating a program: http $c, no row" || bad "owner create: http $c"
  c=$(admin_post admin "{\"action\":\"create\",\"partnerId\":\"$TP\"}")
  [ "$c" = 200 ] && [ "$(q "select is_active from athlete_programs where partner_id='$TP'")" = f ] && ok "the admin creates one: http $c, off until switched on" || bad "admin create: http $c $(cat "$TMP/a.json")"
  c=$(admin_post admin "{\"action\":\"create\",\"partnerId\":\"$TP\"}")
  [ "$c" = 409 ] && ok "creating it again: http $c" || bad "duplicate create: http $c"
fi

if want 10; then echo "== 10. sponsored is the admin's to set"
  fresh
  r=$(rpc bullbox av_athletes_set_level "{\"p_program_athlete_id\":\"$(ID 2003)\",\"p_level\":\"sponsored\"}")
  [[ "$r" == *not_allowed* ]] && [ "$(q "select level from program_athletes where id='$(ID 2003)'")" = athlete ] && ok "the owner: not_allowed" || bad "owner sponsored: $r"
  r=$(rpc admin av_athletes_set_level "{\"p_program_athlete_id\":\"$(ID 2003)\",\"p_level\":\"sponsored\"}")
  [ "$(q "select level from program_athletes where id='$(ID 2003)'")" = sponsored ] && ok "the admin: Caro is sponsored" || bad "admin sponsored: $r"
fi

echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" = 0 ]
