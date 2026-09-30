#!/bin/bash
# T-AV21 acceptance proof. Real JWTs, through PostgREST, against the LOCAL
# stack (production's schema, T-AV19 grant parity) with migration 8200 applied.
#
#   bash supabase/recon/t-av21-proof.LOCAL.sh            # every test
#   ONLY="3 6" bash supabase/recon/t-av21-proof.LOCAL.sh  # a subset (the mutation driver uses this)
#
# LOCAL ONLY: refuses unless both the API and Postgres are on localhost,
# 127.0.0.1 or [::1]. Builds its own fixtures, asserts they exist before any
# test, and removes them on exit (success, failure or interrupt).
#
# Prefer: return=minimal throughout, and every write is judged by COUNTING
# rows before and after, never by the HTTP body alone: with
# return=representation a successful insert whose read-back is refused looks
# exactly like a refused insert (the T-AV1 S3 lesson).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
API="$NEXT_PUBLIC_SUPABASE_URL"; ANON="$NEXT_PUBLIC_SUPABASE_ANON_KEY"; SVC="$SUPABASE_SERVICE_ROLE_KEY"
PGURL="${AV_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$API"   || { echo "REFUSED: API is not local: $(python3 -c "import sys,urllib.parse as u;print(u.urlparse(sys.argv[1]).hostname)" "$API")"; exit 2; }
is_local "$PGURL" || { echo "REFUSED: Postgres is not local"; exit 2; }

q() { psql -X -v ON_ERROR_STOP=1 -At -d "$PGURL" -c "$1" < /dev/null; }
want() { [ -z "${ONLY:-}" ] || [[ " $ONLY " == *" $1 "* ]]; }

OWNER=00000000-0000-4000-8000-000000000007   # BullBox (Prueba), owns partner A
ANA=00000000-0000-4000-8000-000000000001     # the guest: a lead carries her email
BETO=00000000-0000-4000-8000-000000000002    # active coach of partner B
CARO=00000000-0000-4000-8000-000000000003    # owner of partner B
DIEGO=00000000-0000-4000-8000-000000000004   # coach of A with is_active NULL
ELENA=00000000-0000-4000-8000-000000000005   # active coach of A
FELIPE=00000000-0000-4000-8000-000000000006  # coach of A with is_active false
PA=$(q "select id from featured_partners where slug='bullbox-prueba'")
PB=5a5a5a5a-2100-4000-8000-000000000b0b
ADMIN_EMAIL=tav21-admin@av.local
C1=TV-A2B3; C2=TV-C4D5; C3=TV-E6F7; FAKE=ZZ-2345; CANON=TV-G8H9; CAUTH=TV-J2K3; CFORGE=TV-K4M5

# Since T-AV22 the seed itself makes Elena (active) and Felipe (inactive)
# coaches of partner A. This script reshapes those rows for its own tests, so
# it records them first and puts them back on exit instead of deleting them.
COACH_SNAP=$(q "select coalesce(string_agg(format('(%L::uuid,%L::uuid,%s)', partner_id, instructor_id, coalesce(is_active::text,'NULL')), ','), '') from partner_instructors where partner_id='$PA' and instructor_id in ('$ELENA','$FELIPE','$DIEGO')")
cleanup() {
  q "delete from pass_leads where pass_code like 'TV-%';" >/dev/null
  q "delete from partner_instructors where (partner_id='$PA' and instructor_id in ('$ELENA','$FELIPE','$DIEGO')) or partner_id='$PB';" >/dev/null
  [ -n "$COACH_SNAP" ] && q "insert into partner_instructors (partner_id, instructor_id, is_active) values $COACH_SNAP;" >/dev/null
  q "delete from featured_partners where id='$PB';" >/dev/null
  AID=$(q "select id from auth.users where email='$ADMIN_EMAIL'")
  if [ -n "$AID" ]; then
    q "delete from public.users where id='$AID';" >/dev/null
    curl -s -o /dev/null -X DELETE "$API/auth/v1/admin/users/$AID" -H "apikey: $SVC" -H "Authorization: Bearer $SVC"
  fi
}
trap cleanup EXIT
q "delete from pass_leads where pass_code like 'TV-%';" >/dev/null
q "delete from partner_instructors where (partner_id='$PA' and instructor_id in ('$ELENA','$FELIPE','$DIEGO')) or partner_id='$PB';" >/dev/null
q "delete from featured_partners where id='$PB';" >/dev/null

# ── fixtures ────────────────────────────────────────────────────────────────
q "insert into featured_partners (id, business_name, slug, business_type, status, user_id) values ('$PB','T-AV21 Probe Gym','tav21-probe-gym','gym','active','$CARO');" >/dev/null
q "insert into partner_instructors (partner_id, instructor_id, is_active) values ('$PA','$ELENA',true),('$PA','$FELIPE',false),('$PA','$DIEGO',null),('$PB','$BETO',true);" >/dev/null
q "update partner_instructors set is_active = null where partner_id='$PA' and instructor_id='$DIEGO';" >/dev/null
for c in $C1 $C2 $C3; do
  q "insert into pass_leads (slug, partner_id, name, whatsapp, email, pass_code, consent_text) values ('bullbox-prueba','$PA','Laura Martinez Probe','+573001112233','ana@av.local','$c','Autorizo a Tribe a compartir mis datos con el aliado para la prueba T-AV21.');" >/dev/null
done
curl -s -o /dev/null -X POST "$API/auth/v1/admin/users" -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"tribe-local-1234\",\"email_confirm\":true}"
AID=$(q "select id from auth.users where email='$ADMIN_EMAIL'")
q "insert into public.users (id, name, email, is_admin) values ('$AID','T-AV21 Admin','$ADMIN_EMAIL',true) on conflict (id) do update set is_admin = true;" >/dev/null

# Assert the fixtures landed before believing any refusal below.
[ -n "$PA" ] || { echo "FATAL: partner A missing"; exit 1; }
[ "$(q "select count(*) from featured_partners where id='$PB' and user_id='$CARO'")" = 1 ] || { echo "FATAL: partner B missing"; exit 1; }
[ "$(q "select count(*) from partner_instructors where partner_id='$PA' and instructor_id='$ELENA' and is_active is true")" = 1 ] || { echo "FATAL: active coach missing"; exit 1; }
[ "$(q "select count(*) from partner_instructors where partner_id='$PA' and instructor_id='$FELIPE' and is_active is false")" = 1 ] || { echo "FATAL: inactive coach missing"; exit 1; }
[ "$(q "select count(*) from partner_instructors where partner_id='$PA' and instructor_id='$DIEGO' and is_active is null")" = 1 ] || { echo "FATAL: NULL coach missing"; exit 1; }
[ "$(q "select count(*) from pass_leads where pass_code in ('$C1','$C2','$C3')")" = 3 ] || { echo "FATAL: leads missing"; exit 1; }
[ "$(q "select count(*) from users where id='$AID' and is_admin")" = 1 ] || { echo "FATAL: admin missing"; exit 1; }
[ "$(q "select count(*) from pass_leads where pass_code='$FAKE'")" = 0 ] || { echo "FATAL: the made-up code exists"; exit 1; }

tok() { curl -s -X POST "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"tribe-local-1234\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))"; }
sub() { python3 -c "import sys,json,base64;p=sys.argv[1].split('.')[1];p+='='*(-len(p)%4);print(json.loads(base64.urlsafe_b64decode(p))['sub'])" "$1"; }
# bash 3.2 (macOS) has no associative arrays: one variable per user, read by jwt().
for who in bullbox ana beto caro diego elena felipe; do eval "J_$who=\$(tok \"$who@av.local\")"; done
J_admin=$(tok "$ADMIN_EMAIL")
jwt() { local v="J_$1"; echo "${!v}"; }
[ "$(sub "$(jwt bullbox)")" = "$OWNER" ] && [ "$(sub "$(jwt elena)")" = "$ELENA" ] && [ "$(sub "$(jwt admin)")" = "$AID" ] \
  || { echo "FATAL: a JWT did not decode to the expected user"; exit 1; }
echo "fixtures ok; JWTs verified (owner, coaches, other partner, guest, admin)"
echo

rpc() { # rpc <jwt> <fn> <json> -> prints the response body
  curl -s -X POST "$API/rest/v1/rpc/$2" -H "apikey: $ANON" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$3"; }
pass=0; fail=0
ok()  { printf "  PASS  %s\n" "$1"; pass=$((pass+1)); }
bad() { printf "  FAIL  %s\n" "$1"; fail=$((fail+1)); }
attended() { q "select coalesce(attended_at::text,'NULL')||'|'||coalesce(attended_method,'NULL')||'|'||coalesce(attended_marked_by::text,'NULL') from pass_leads where pass_code='$1'"; }
NOTFOUND='{"error": "not_found", "success": false}'

if want 1; then echo "== 1. owner confirms"
  r=$(rpc "$(jwt bullbox)" av_confirm_pass_attendance "{\"p_pass_code\":\"$C1\",\"p_method\":\"scan\"}")
  a=$(attended $C1)
  [[ "$r" == *'"success": true'* && "$a" != NULL* && "$a" == *"|scan|$OWNER" ]] && ok "owner: columns set, method scan, marked_by owner" || bad "owner confirm: $r / $a"
fi

if want 2; then echo "== 2. coaches"
  r=$(rpc "$(jwt elena)" av_confirm_pass_attendance "{\"p_pass_code\":\"$C2\",\"p_method\":\"toggle\"}")
  [[ "$r" == *'"success": true'* && "$(attended $C2)" == *"|toggle|$ELENA" ]] && ok "active coach confirms" || bad "active coach: $r"
  for who in felipe diego; do
    r=$(rpc "$(jwt $who)" av_confirm_pass_attendance "{\"p_pass_code\":\"$C3\",\"p_method\":\"scan\"}")
    [ "$r" = "$NOTFOUND" ] && [[ "$(attended $C3)" == NULL* ]] && ok "$who (is_active $([ $who = felipe ] && echo false || echo NULL)) refused, row untouched" || bad "$who: $r"
  done
fi

if want 3; then echo "== 3. other partner: byte-identical for a real and a made-up code"
  for who in beto caro; do
    for fn in av_door_pass av_confirm_pass_attendance; do
      args_real="{\"p_pass_code\":\"$C3\"$([ $fn = av_confirm_pass_attendance ] && echo ',"p_method":"scan"')}"
      args_fake="{\"p_pass_code\":\"$FAKE\"$([ $fn = av_confirm_pass_attendance ] && echo ',"p_method":"scan"')}"
      real=$(rpc "$(jwt $who)" $fn "$args_real"); fake=$(rpc "$(jwt $who)" $fn "$args_fake")
      [ "$real" = "$fake" ] && [ "$real" = "$NOTFOUND" ] && [[ "$(attended $C3)" == NULL* ]] \
        && ok "$who $fn: refused, real == made-up byte for byte" || bad "$who $fn: real=$real fake=$fake"
    done
  done
fi

if want 4; then echo "== 4. the guest herself, and anon"
  r=$(rpc "$(jwt ana)" av_confirm_pass_attendance "{\"p_pass_code\":\"$C3\",\"p_method\":\"scan\"}")
  [ "$r" = "$NOTFOUND" ] && ok "guest (lead email) signed in: confirm refused" || bad "guest confirm: $r"
  r=$(rpc "$(jwt ana)" av_door_pass "{\"p_pass_code\":\"$C3\"}")
  [ "$r" = "$NOTFOUND" ] && ok "guest (lead email) signed in: read refused" || bad "guest read: $r"
  code=$(curl -s -o /tmp/_tav21a.out -w '%{http_code}' -X POST "$API/rest/v1/rpc/av_confirm_pass_attendance" -H "apikey: $ANON" -H 'Content-Type: application/json' -d "{\"p_pass_code\":\"$C3\",\"p_method\":\"scan\"}")
  [[ "$code" =~ ^40[13]$ ]] && grep -q 42501 /tmp/_tav21a.out && [[ "$(attended $C3)" == NULL* ]] && ok "anon: refused (http $code, 42501)" || bad "anon: http $code $(head -c 150 /tmp/_tav21a.out)"
fi

if want 5; then echo "== 5. direct UPDATE as authenticated"
  code=$(curl -s -o /tmp/_tav21u.out -w '%{http_code}' -X PATCH "$API/rest/v1/pass_leads?pass_code=eq.$C3" -H "apikey: $ANON" \
    -H "Authorization: Bearer $(jwt bullbox)" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' -d '{"attended_at":"2026-01-01T00:00:00Z"}')
  grep -q '"42501"' /tmp/_tav21u.out && [[ "$(attended $C3)" == NULL* ]] && ok "owner PATCH attended_at: 42501 (grant), http $code, row untouched" || bad "update: http $code $(head -c 150 /tmp/_tav21u.out)"
fi

if want 6; then echo "== 6. inserts through PostgREST"
  body() { echo "{\"slug\":\"bullbox-prueba\",\"partner_id\":\"$PA\",\"name\":\"Probe Claim\",\"whatsapp\":\"+573001112233\",\"email\":\"probe@example.invalid\",\"pass_code\":\"$1\",\"consent_text\":\"Autorizo a Tribe a compartir mis datos con el aliado.\"$2}"; }
  ins() { curl -s -o /tmp/_tav21i.out -w '%{http_code}' -X POST "$API/rest/v1/pass_leads" -H "apikey: $ANON" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' -d "$2"; }
  n=$(q "select count(*) from pass_leads where pass_code='$CFORGE'")
  code=$(ins "$ANON" "$(body $CFORGE ',"attended_at":"2026-09-29T12:00:00Z"')")
  [ "$(q "select count(*) from pass_leads where pass_code='$CFORGE'")" = "$n" ] && ok "anon INSERT with attended_at: refused (http $code, rows $n -> $n)" || bad "anon forged insert WROTE (http $code)"
  code=$(ins "$(jwt ana)" "$(body $CFORGE ',"attended_at":"2026-09-29T12:00:00Z","attended_method":"scan"')")
  [ "$(q "select count(*) from pass_leads where pass_code='$CFORGE'")" = "$n" ] && ok "authenticated INSERT with attended_at: refused (http $code, rows $n -> $n)" || bad "authenticated forged insert WROTE (http $code)"
  code=$(ins "$ANON" "$(body $CANON '')")
  [ "$(q "select count(*) from pass_leads where pass_code='$CANON'")" = 1 ] && ok "anon normal claim: still accepted (http $code, 0 -> 1)" || bad "normal claim refused (http $code $(head -c 150 /tmp/_tav21i.out))"
  code=$(ins "$(jwt ana)" "$(body $CAUTH '')")
  [ "$(q "select count(*) from pass_leads where pass_code='$CAUTH'")" = 1 ] && ok "authenticated normal claim: still accepted (http $code, 0 -> 1)" || bad "authenticated normal claim refused (http $code)"
fi

if want 7; then echo "== 7. second confirm"
  before=$(attended $C1)
  [[ "$before" == NULL* ]] && rpc "$(jwt bullbox)" av_confirm_pass_attendance "{\"p_pass_code\":\"$C1\",\"p_method\":\"scan\"}" >/dev/null && before=$(attended $C1)
  sleep 1
  r=$(rpc "$(jwt elena)" av_confirm_pass_attendance "{\"p_pass_code\":\"$C1\",\"p_method\":\"toggle\"}")
  [ "$(attended $C1)" = "$before" ] && [[ "$r" == *'"already_confirmed": true'* ]] && ok "attended_at, method and marker unchanged; reported already_confirmed" || bad "second confirm changed the row: $before -> $(attended $C1) ($r)"
fi

# T-AV22 (8206) widened av_door_pass by athlete_first_name, outcome and the
# welcome offer. The exact key set below is the new contract; the point of
# the test is unchanged: the guest's first name only, never contact details.
if want 10; then echo "== added: av_door_pass returns the first name only, for every authorized caller"
  for who in bullbox elena admin; do
    r=$(rpc "$(jwt $who)" av_door_pass "{\"p_pass_code\":\"$C3\"}")
    keys=$(echo "$r" | python3 -c "import sys,json;print(','.join(sorted(json.load(sys.stdin).keys())))")
    first=$(echo "$r" | python3 -c "import sys,json;print(json.load(sys.stdin).get('guest_first_name',''))")
    [ "$keys" = "athlete_first_name,attended_at,claimed_at,guest_first_name,outcome,partner_name,success,welcome_offer_en,welcome_offer_es" ] && [ "$first" = "Laura" ] \
      && [[ "$r" != *Martinez* && "$r" != *"@"* && "$r" != *3001112233* ]] \
      && ok "$who: keys exactly {$keys}, first name only, no email or WhatsApp" || bad "$who door read: $r"
  done
fi

echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" = 0 ]
