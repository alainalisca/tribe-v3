#!/bin/bash
# T-AV22 acceptance proof. Real JWTs, through PostgREST, against the LOCAL
# stack with 201 to 208 applied and `npm run av:seed` run.
#
#   bash supabase/recon/t-av22-proof.LOCAL.sh             # every test
#   ONLY="7 8" bash supabase/recon/t-av22-proof.LOCAL.sh   # a subset (the mutation driver uses this)
#
# LOCAL ONLY: refuses unless both the API and Postgres are on localhost,
# 127.0.0.1 or [::1]. Rebuilds the seed's programs, athletes and leads
# (node scripts/av-seed-athletes.mjs) before it starts, between tests that
# write, and on exit, so every test starts from the seeded state.
#
# Writes are judged by reading the row back with psql, never by the HTTP body
# alone. Refusals are compared to the exact not_found body where one exists.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
API="$NEXT_PUBLIC_SUPABASE_URL"; ANON="$NEXT_PUBLIC_SUPABASE_ANON_KEY"
PGURL="${AV_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$API"   || { echo "REFUSED: API is not local"; exit 2; }
is_local "$PGURL" || { echo "REFUSED: Postgres is not local"; exit 2; }

q() { psql -X -v ON_ERROR_STOP=1 -At -d "$PGURL" -c "$1" < /dev/null; }
want() { [ -z "${ONLY:-}" ] || [[ " $ONLY " == *" $1 "* ]]; }
reset() { node scripts/av-seed-athletes.mjs < /dev/null > /tmp/_tav22_reset.out 2>&1 || { echo "FATAL: seed reset failed"; cat /tmp/_tav22_reset.out; exit 1; }; }
cleanup() { q "delete from pass_leads where pass_code like 'TW-%';" >/dev/null; reset; }
trap cleanup EXIT

ID() { printf '00000000-0000-4000-8000-%012d' "$1"; }
ANA=$(ID 1); BETO=$(ID 2); CARO=$(ID 3); DIEGO=$(ID 4); ELENA=$(ID 5); FELIPE=$(ID 6); OWNER=$(ID 7)
ANA_PA=$(ID 2001); BETO_PA=$(ID 2002); CARO_PA=$(ID 2003)

reset
PA=$(q "select id from featured_partners where user_id='$OWNER'")
PB=$(q "select id from featured_partners where user_id='$(ID 9)'")
lead_id() { q "select id from pass_leads where pass_code='$1'"; }

# ── fixtures must exist before any refusal is believed ─────────────────────
[ -n "$PA" ] && [ -n "$PB" ] || { echo "FATAL: seed partners missing; run npm run av:seed"; exit 1; }
[ "$(q "select count(*) from pass_leads where partner_id in ('$PA','$PB')")" = 33 ] || { echo "FATAL: expected 33 seed leads"; exit 1; }
[ "$(q "select count(*) from program_athletes where partner_id='$PA' and status='active'")" = 3 ] || { echo "FATAL: expected 3 active athletes"; exit 1; }
[ "$(q "select count(*) from partner_instructors where partner_id='$PA' and instructor_id='$ELENA' and is_active is true")" = 1 ] || { echo "FATAL: active coach missing"; exit 1; }
[ "$(q "select count(*) from partner_instructors where partner_id='$PA' and instructor_id='$FELIPE' and is_active is false")" = 1 ] || { echo "FATAL: inactive coach missing"; exit 1; }
[ "$(q "select count(*) from users where email='admin@av.local' and is_admin")" = 1 ] || { echo "FATAL: admin missing"; exit 1; }

tok() { curl -s -X POST "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"tribe-local-1234\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))"; }
sub() { python3 -c "import sys,json,base64;p=sys.argv[1].split('.')[1];p+='='*(-len(p)%4);print(json.loads(base64.urlsafe_b64decode(p))['sub'])" "$1"; }
for who in bullbox ana beto caro diego elena felipe gabi otro admin; do eval "J_$who=\$(tok \"$who@av.local\")"; done
jwt() { local v="J_$1"; echo "${!v}"; }
for pair in "bullbox:$OWNER" "ana:$ANA" "elena:$ELENA" "gabi:$(ID 10)" "otro:$(ID 9)" "admin:$(ID 8)"; do
  [ "$(sub "$(jwt "${pair%%:*}")")" = "${pair#*:}" ] || { echo "FATAL: the ${pair%%:*} JWT did not decode to its user"; exit 1; }
done
echo "fixtures ok; JWTs verified"; echo

rpc() { curl -s -X POST "$API/rest/v1/rpc/$2" -H "apikey: $ANON" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$3"; }
get() { curl -s -w '\n%{http_code}' "$API/rest/v1/$2" -H "apikey: $ANON" -H "Authorization: Bearer $1"; }
js() { python3 -c "import sys,json; d=json.loads(sys.argv[1]); print($2)" "$1" 2>/dev/null; }
pass=0; fail=0
ok()  { printf "  PASS  %s\n" "$1"; pass=$((pass+1)); }
bad() { printf "  FAIL  %s\n" "$1"; fail=$((fail+1)); }
NOTFOUND='{"error": "not_found", "success": false}'

if want 3; then echo "== 3. athlete A cannot read athlete B's guests, counts or contact"
  r=$(rpc "$(jwt ana)" av_athletes_my_summary '{}')
  g=$(js "$r" "len(d['programs'][0]['guests'])"); inv=$(js "$r" "d['programs'][0]['counts']['invited']")
  names=$(js "$r" "','.join(sorted(x['first_name'] for x in d['programs'][0]['guests']))")
  [ "$g" = 9 ] && [ "$inv" = 9 ] && [ "$(js "$r" "len(d['programs'])")" = 1 ] \
    && [ "$names" = "Andres,Beatriz,Camilo,Daniela,Esteban,Fabiola,Gustavo,Helena,Ivan" ] \
    && ok "Ana my_summary: her 9 guests only (saw: $names)" || bad "Ana my_summary: guests=$g invited=$inv names=$names"
  [[ "$r" != *"@"* && "$r" != *"+5730055"* ]] && ok "Ana my_summary: no guest email or WhatsApp anywhere" || bad "Ana my_summary leaks contact: $r"
  out=$(get "$(jwt ana)" "program_athletes?select=id,user_id"); body=${out%$'\n'*}
  [ "$(js "$body" "','.join(x['id'] for x in d)")" = "$ANA_PA" ] && ok "Ana SELECT program_athletes: her own row only" || bad "Ana program_athletes: $body"
  out=$(get "$(jwt ana)" "program_athletes?select=email_lower"); code=${out##*$'\n'}
  [[ "$out" == *42501* ]] && ok "Ana SELECT email_lower: 42501 (http $code)" || bad "Ana email_lower: $out"
  out=$(get "$(jwt ana)" "program_athletes?select=whatsapp_e164"); code=${out##*$'\n'}
  [[ "$out" == *42501* ]] && ok "Ana SELECT whatsapp_e164: 42501 (http $code)" || bad "Ana whatsapp_e164: $out"
  r=$(rpc "$(jwt ana)" av_athletes_partner_summary "{\"p_partner_id\":\"$PA\"}")
  [ "$r" = "$NOTFOUND" ] && ok "Ana partner_summary: not_found" || bad "Ana partner_summary: $(echo "$r" | head -c 200)"
  out=$(get "$(jwt ana)" "pass_leads?select=id"); body=${out%$'\n'*}
  [ "$body" = "[]" ] && ok "Ana SELECT pass_leads: 0 rows" || bad "Ana pass_leads: $body"
  r=$(rpc "$(jwt ana)" av_athletes_ledger_totals "{\"p_partner_id\":\"$PA\"}")
  [[ "$r" == *42501* ]] && ok "Ana calls the ledger directly: 42501" || bad "Ana ledger: $(echo "$r" | head -c 200)"
fi

keys_of() { python3 -c "
import sys,json
def walk(o):
    if isinstance(o,dict):
        for k,v in o.items(): yield k; yield from walk(v)
    elif isinstance(o,list):
        for v in o: yield from walk(v)
print(','.join(sorted(set(walk(json.loads(sys.argv[1]))))))" "$1"; }

if want 4; then echo "== 4. coach payload has no bonus fields"
  own=$(keys_of "$(rpc "$(jwt bullbox)" av_athletes_partner_summary "{\"p_partner_id\":\"$PA\"}")")
  [[ ",$own," == *",bonus_owed,"* && ",$own," == *",conversion_bonus_cop,"* && ",$own," == *",whatsapp_e164,"* ]] \
    && ok "owner payload DOES carry bonus and contact keys (so the check below can fail)" || bad "owner payload keys: $own"
  r=$(rpc "$(jwt elena)" av_athletes_partner_summary "{\"p_partner_id\":\"$PA\"}"); k=$(keys_of "$r")
  [ "$(js "$r" "d['success'] and len(d['athletes'])")" = 3 ] && [[ "$k" != *bonus* && "$k" != *email* && "$k" != *whatsapp* ]] \
    && ok "active coach: 3 athletes, no key containing bonus, email or whatsapp at any depth" || bad "coach keys: $k"
  for who in felipe gabi otro; do
    r=$(rpc "$(jwt $who)" av_athletes_partner_summary "{\"p_partner_id\":\"$PA\"}")
    [ "$r" = "$NOTFOUND" ] && ok "$who partner_summary: not_found" || bad "$who partner_summary: $(echo "$r" | head -c 150)"
  done
fi

if want 5; then echo "== 5. sixth active athlete refused; owner setting sponsored refused"
  r=$(rpc "$(jwt bullbox)" av_athletes_add "{\"p_partner_id\":\"$PA\",\"p_user_id\":\"$DIEGO\",\"p_whatsapp\":\"300 111 2233\"}")
  [ "$(js "$r" "d.get('error')")" = invalid_whatsapp ] && ok "owner add with a non-E.164 WhatsApp: invalid_whatsapp" || bad "non-E.164 add: $r"
  r4=$(rpc "$(jwt bullbox)" av_athletes_add "{\"p_partner_id\":\"$PA\",\"p_user_id\":\"$DIEGO\",\"p_whatsapp\":\"+573001114444\"}")
  r5=$(rpc "$(jwt bullbox)" av_athletes_add "{\"p_partner_id\":\"$PA\",\"p_user_id\":\"$ELENA\",\"p_whatsapp\":null}")
  code4=$(js "$r4" "d.get('ref_code')")
  [[ "$(js "$r4" "d['success']")" = True && "$(js "$r5" "d['success']")" = True && "$code4" =~ ^DIEGO-[A-HJ-NP-Z2-9]{3}$ ]] \
    && ok "4th and 5th added (ref code $code4)" || bad "4th/5th add: $r4 / $r5"
  r6=$(rpc "$(jwt bullbox)" av_athletes_add "{\"p_partner_id\":\"$PA\",\"p_user_id\":\"$FELIPE\",\"p_whatsapp\":null}")
  n=$(q "select count(*) from program_athletes where partner_id='$PA' and status='active'")
  [ "$(js "$r6" "d.get('error')")" = program_full ] && [ "$n" = 5 ] && ok "6th: program_full, active stays 5" || bad "6th add: $r6 (active $n)"
  r=$(rpc "$(jwt bullbox)" av_athletes_set_level "{\"p_program_athlete_id\":\"$ANA_PA\",\"p_level\":\"sponsored\"}")
  [ "$(js "$r" "d.get('error')")" = not_allowed ] && [ "$(q "select level from program_athletes where id='$ANA_PA'")" = captain ] \
    && ok "owner set sponsored: not_allowed, level stays captain" || bad "owner sponsored: $r"
  r=$(rpc "$(jwt admin)" av_athletes_set_level "{\"p_program_athlete_id\":\"$ANA_PA\",\"p_level\":\"sponsored\"}")
  [ "$(q "select level from program_athletes where id='$ANA_PA'")" = sponsored ] && ok "admin set sponsored: allowed (the refusal is about who)" || bad "admin sponsored: $r"
  r=$(rpc "$(jwt bullbox)" av_athletes_set_level "{\"p_program_athlete_id\":\"$ANA_PA\",\"p_level\":\"athlete\"}")
  [ "$(js "$r" "d.get('error')")" = not_allowed ] && ok "owner cannot move an athlete OUT of sponsored either" || bad "owner demote sponsored: $r"
  reset
fi

if want 6; then echo "== 6. joined without show-up refused; retained before retention_days refused"
  r=$(rpc "$(jwt elena)" av_athletes_set_outcome '{"p_pass_code":"AV-CARA","p_outcome":"joined"}')
  [ "$(js "$r" "d.get('error')")" = not_attended ] && [ "$(q "select coalesce(outcome,'NULL') from pass_leads where pass_code='AV-CARA'")" = NULL ] \
    && ok "coach: joined on a lead with no show-up: not_attended, outcome stays NULL" || bad "joined without show-up: $r"
  r=$(rpc "$(jwt elena)" av_athletes_set_outcome '{"p_pass_code":"AV-CARB","p_outcome":"joined"}')
  [ "$(q "select outcome from pass_leads where pass_code='AV-CARB'")" = joined ] && ok "coach: joined on an attended lead is accepted (the refusal is about the show-up)" || bad "joined after show-up: $r"
  r=$(rpc "$(jwt bullbox)" av_athletes_mark_retained "{\"p_lead_id\":\"$(lead_id AV-CARC)\"}")
  [ "$(js "$r" "d.get('error')")" = too_early ] && [ "$(q "select coalesce(retained_at::text,'NULL') from pass_leads where pass_code='AV-CARC'")" = NULL ] \
    && ok "owner: retained 5 days after joining (30 required): too_early, retained_at stays NULL" || bad "early retained: $r"
  r=$(rpc "$(jwt bullbox)" av_athletes_mark_retained "{\"p_lead_id\":\"$(lead_id AV-CARE)\"}")
  [ "$(q "select (retained_at is not null)::text from pass_leads where pass_code='AV-CARE'")" = true ] && ok "owner: retained 40 days after joining is accepted" || bad "due retained: $r"
  r=$(rpc "$(jwt elena)" av_athletes_mark_retained "{\"p_lead_id\":\"$(lead_id AV-CARD)\"}")
  [ "$r" = "$NOTFOUND" ] && ok "coach cannot mark retained: not_found" || bad "coach retained: $r"
  reset
fi

if want 7; then echo "== 7. the ledger returns exactly the table written before any code"
  EXPECTED='Ana Prueba|captain|9|0|9|0|0|0|0|false
Beto Prueba|captain|10|0|10|1|0|0|0|true
Caro Prueba|athlete|7|5|6|3|1|2|1|false'
  GOT=$(q "select u.name||'|'||t.level||'|'||t.invited||'|'||t.not_credited||'|'||t.showed_up||'|'||t.joined||'|'||t.retained||'|'||t.bonus_owed||'|'||t.bonus_settled||'|'||t.ready_to_promote from av_athletes_ledger_totals('$PA') t join users u on u.id = t.user_id order by u.name")
  [ "$GOT" = "$EXPECTED" ] && ok "ledger totals match the expected table exactly" || { bad "ledger totals differ"; echo "      expected:"; echo "$EXPECTED" | sed 's/^/        /'; echo "      got:"; echo "$GOT" | sed 's/^/        /'; }
  REASONS=$(q "select string_agg(pass_code||'='||no_credit_reason, ',' order by pass_code) from av_athletes_ledger('$PA') where not credited")
  [ "$REASONS" = "AV-CARH=already_member,AV-CARJ=self_email,AV-CARK=self_whatsapp,AV-CARL=returning,AV-CARM=duplicate" ] \
    && ok "no-credit reasons: $REASONS" || bad "no-credit reasons: $REASONS"
  for who in ana beto caro; do
    r=$(rpc "$(jwt $who)" av_athletes_my_summary '{}')
    mine=$(js "$r" "'|'.join(str(d['programs'][0]['counts'][k]) for k in ['invited','not_credited','showed_up','joined','retained','bonus_owed','bonus_settled'])+'|'+str(d['programs'][0]['ready_to_promote']).lower()")
    led=$(echo "$GOT" | grep "^$(python3 -c "print('$who'.capitalize())") " | cut -d'|' -f3-)
    [ -n "$mine" ] && [ "$mine" = "$led" ] && ok "$who my_summary counts = ledger ($mine)" || bad "$who my_summary $mine vs ledger $led"
  done
  gym=$(rpc "$(jwt bullbox)" av_athletes_partner_summary "{\"p_partner_id\":\"$PA\"}")
  t=$(js "$gym" "'|'.join(str(d['totals'][k]) for k in ['invited','not_credited','showed_up','joined','retained','bonus_owed','bonus_settled'])")
  [ "$t" = "26|5|25|4|1|2|1" ] && ok "gym totals = sum of the ledger rows ($t)" || bad "gym totals: $t"
fi

# Insert helpers, shared by tests 8 and 12. ins <bearer> <json> [apikey]
body() { echo "{\"slug\":\"$(q "select slug from featured_partners where id='$PA'")\",\"partner_id\":\"$PA\",\"name\":\"Forge Probe\",\"whatsapp\":\"+573001112233\",\"email\":\"forge@example.invalid\",\"pass_code\":\"$1\",\"consent_text\":\"Autorizo a Tribe a compartir mis datos con el aliado.\"$2}"; }
ins() { curl -s -o /tmp/_tav22i.out -w '%{http_code}' -X POST "$API/rest/v1/pass_leads" -H "apikey: ${3:-$ANON}" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' -d "$2"; }

if want 8; then echo "== 8. INSERT with any of the eight new columns set: refused"
  NOW='"2026-09-29T12:00:00Z"'
  i=0
  for kv in "referred_by_athlete_id:\"$ANA_PA\"" 'outcome:"joined"' "outcome_at:$NOW" "outcome_marked_by:\"$OWNER\"" \
            "retained_at:$NOW" 'bonus_eligible:true' "bonus_settled_at:$NOW" "bonus_settled_by:\"$OWNER\""; do
    i=$((i+1)); col=${kv%%:*}; val=${kv#*:}; pc="TW-FRG$(echo ABCDEFGH | cut -c$i)"
    code=$(ins "$ANON" "$(body "$pc" ",\"$col\":$val")")
    n=$(q "select count(*) from pass_leads where pass_code='$pc'")
    [ "$n" = 0 ] && ok "anon INSERT with $col set: refused (http $code, rows 0 -> 0)" || bad "anon INSERT with $col WROTE (http $code)"
  done
  code=$(ins "$(jwt diego)" "$(body TW-FRGJ ",\"referred_by_athlete_id\":\"$ANA_PA\"")")
  [ "$(q "select count(*) from pass_leads where pass_code='TW-FRGJ'")" = 0 ] && ok "authenticated INSERT with referred_by_athlete_id: refused (http $code, 0 -> 0)" || bad "authenticated forged attribution WROTE (http $code)"
  code=$(ins "$ANON" "$(body TW-CLMA '')")
  [ "$(q "select count(*) from pass_leads where pass_code='TW-CLMA'")" = 1 ] && ok "anon normal claim: still accepted (http $code, 0 -> 1)" || bad "normal claim refused (http $code $(head -c 200 /tmp/_tav22i.out))"
  q "delete from pass_leads where pass_code like 'TW-%';" >/dev/null
fi

if want 9; then echo "== 9. bonus eligibility follows the level at the moment of the join"
  rpc "$(jwt elena)" av_athletes_set_outcome '{"p_pass_code":"AV-ANAA","p_outcome":"joined"}' >/dev/null
  [ "$(q "select coalesce(bonus_eligible::text,'NULL') from pass_leads where pass_code='AV-ANAA'")" = false ] && ok "captain's guest joins: bonus_eligible false" || bad "captain join eligibility"
  rpc "$(jwt elena)" av_athletes_set_outcome '{"p_pass_code":"AV-CARB","p_outcome":"joined"}' >/dev/null
  [ "$(q "select coalesce(bonus_eligible::text,'NULL') from pass_leads where pass_code='AV-CARB'")" = true ] && ok "athlete-level guest joins: bonus_eligible true" || bad "athlete join eligibility"
  rpc "$(jwt elena)" av_athletes_set_outcome '{"p_pass_code":"AV-CARC","p_outcome":"follow_up"}' >/dev/null
  [ "$(q "select coalesce(bonus_eligible::text,'NULL') from pass_leads where pass_code='AV-CARC'")" = NULL ] && ok "outcome leaves joined: bonus_eligible cleared to NULL" || bad "leaving joined did not clear eligibility"
  r=$(rpc "$(jwt bullbox)" av_athletes_mark_bonus_settled "{\"p_lead_id\":\"$(lead_id AV-BETJ)\"}")
  [ "$(js "$r" "d.get('error')")" = not_eligible ] && [ "$(q "select coalesce(bonus_settled_at::text,'NULL') from pass_leads where pass_code='AV-BETJ'")" = NULL ] \
    && ok "owner settles a captain's join: not_eligible" || bad "settle captain join: $r"
  r=$(rpc "$(jwt elena)" av_athletes_mark_bonus_settled "{\"p_lead_id\":\"$(lead_id AV-CARD)\"}")
  [ "$r" = "$NOTFOUND" ] && ok "coach settles a bonus: not_found" || bad "coach settle: $r"
  r=$(rpc "$(jwt bullbox)" av_athletes_mark_bonus_settled "{\"p_lead_id\":\"$(lead_id AV-CARD)\"}")
  [ "$(q "select (bonus_settled_at is not null)::text from pass_leads where pass_code='AV-CARD'")" = true ] && ok "owner settles an eligible, credited join: accepted" || bad "owner settle: $r"
  r=$(rpc "$(jwt elena)" av_athletes_set_outcome '{"p_pass_code":"AV-CARE","p_outcome":"not_now"}')
  [ "$(js "$r" "d.get('error')")" = locked ] && ok "a settled join cannot be re-marked: locked" || bad "locked: $r"
  reset
fi

if want 10; then echo "== 10. set_outcome: other partner, inactive coach and a made-up code look identical"
  for who in gabi otro felipe; do
    real=$(rpc "$(jwt $who)" av_athletes_set_outcome '{"p_pass_code":"AV-CARB","p_outcome":"follow_up"}')
    fake=$(rpc "$(jwt $who)" av_athletes_set_outcome '{"p_pass_code":"ZZ-2345","p_outcome":"follow_up"}')
    [ "$real" = "$NOTFOUND" ] && [ "$fake" = "$real" ] && [ "$(q "select coalesce(outcome,'NULL') from pass_leads where pass_code='AV-CARB'")" = NULL ] \
      && ok "$who: refused, real == made-up byte for byte, row untouched" || bad "$who set_outcome: real=$real fake=$fake"
  done
fi

if want 11; then echo "== 11. door list, and the is_active guard"
  r=$(rpc "$(jwt elena)" av_door_list "{\"p_partner_id\":\"$PA\"}")
  n=$(q "select count(*) from pass_leads where partner_id='$PA' and created_at >= now() - interval '14 days'")
  [ "$(js "$r" "len(d['leads'])")" = "$n" ] && [[ "$r" != *"@"* && "$r" != *"+57"* ]] && ok "coach door list: $n leads from the last 14 days, no contact details" || bad "door list: $(echo "$r" | head -c 200)"
  r=$(rpc "$(jwt gabi)" av_door_list "{\"p_partner_id\":\"$PA\"}")
  [ "$r" = "$NOTFOUND" ] && ok "other-partner coach door list: not_found" || bad "gabi door list: $r"
  patch() { curl -s -o /tmp/_tav22p.out -w '%{http_code}' -X PATCH "$API/rest/v1/athlete_programs?partner_id=eq.$PA" -H "apikey: $ANON" \
    -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' -d "$2"; }
  code=$(patch "$(jwt bullbox)" '{"is_active":false}')
  [ "$(q "select is_active from athlete_programs where partner_id='$PA'")" = t ] && grep -q 42501 /tmp/_tav22p.out \
    && ok "owner turns the program off: refused by the admin guard (http $code, 42501)" || bad "owner is_active: http $code $(cat /tmp/_tav22p.out)"
  code=$(patch "$(jwt bullbox)" '{"welcome_offer_en":"Probe offer"}')
  [ "$(q "select welcome_offer_en from athlete_programs where partner_id='$PA'")" = "Probe offer" ] && ok "owner edits the welcome offer: accepted (http $code)" || bad "owner offer edit: http $code"
  code=$(patch "$(jwt elena)" '{"welcome_offer_en":"Coach offer"}')
  [ "$(q "select welcome_offer_en from athlete_programs where partner_id='$PA'")" = "Probe offer" ] && ok "coach edits the welcome offer: no row changed (http $code)" || bad "coach offer edit landed"
  code=$(patch "$(jwt admin)" '{"is_active":false}')
  [ "$(q "select is_active from athlete_programs where partner_id='$PA'")" = f ] && ok "admin turns the program off: accepted (http $code)" || bad "admin is_active: http $code $(cat /tmp/_tav22p.out)"
  reset
fi

if want 12; then echo "== 12. program columns are server only, admin included (208)"
  code=$(ins "$(jwt admin)" "$(body TW-ADMA ",\"referred_by_athlete_id\":\"$ANA_PA\"")")
  [ "$(q "select count(*) from pass_leads where pass_code='TW-ADMA'")" = 0 ] && ok "admin INSERT with referred_by_athlete_id: refused (http $code, 0 -> 0)" || bad "admin forged attribution WROTE (http $code)"
  code=$(ins "$(jwt admin)" "$(body TW-ADMB ",\"attended_at\":\"2026-09-29T12:00:00Z\"")")
  [ "$(q "select count(*) from pass_leads where pass_code='TW-ADMB'")" = 0 ] && ok "admin INSERT with attended_at: refused (http $code, 0 -> 0)" || bad "admin forged show-up WROTE (http $code)"
  code=$(ins "$(jwt admin)" "$(body TW-ADMC '')")
  [ "$(q "select count(*) from pass_leads where pass_code='TW-ADMC'")" = 1 ] && ok "admin INSERT of a plain lead: accepted (http $code, 0 -> 1)" || bad "admin plain lead refused (http $code $(head -c 200 /tmp/_tav22i.out))"
  code=$(ins "$ANON" "$(body TW-ANOC '')")
  [ "$(q "select count(*) from pass_leads where pass_code='TW-ANOC'")" = 1 ] && ok "anon normal claim: accepted (http $code, 0 -> 1)" || bad "anon claim refused (http $code)"
  code=$(ins "$(jwt diego)" "$(body TW-AUTC '')")
  [ "$(q "select count(*) from pass_leads where pass_code='TW-AUTC'")" = 1 ] && ok "authenticated normal claim: accepted (http $code, 0 -> 1)" || bad "authenticated claim refused (http $code)"
  # The service role is what /api/pase inserts with (getServiceRoleClient). It
  # has BYPASSRLS, so attribution written there (T-AV23) must still land.
  code=$(ins "$SUPABASE_SERVICE_ROLE_KEY" "$(body TW-SRVC ",\"referred_by_athlete_id\":\"$ANA_PA\"")" "$SUPABASE_SERVICE_ROLE_KEY")
  [ "$(q "select referred_by_athlete_id from pass_leads where pass_code='TW-SRVC'")" = "$ANA_PA" ] && ok "service role INSERT with referred_by_athlete_id: accepted and stored (http $code)" || bad "service role attributed insert refused (http $code $(head -c 200 /tmp/_tav22i.out))"
  q "delete from pass_leads where pass_code like 'TW-%';" >/dev/null
fi

echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" = 0 ]
