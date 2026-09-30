#!/bin/bash
# T-AV22 acceptance 2: the probe matrix, written to docs/T-AV22_PROBES.md.
#
#   bash supabase/recon/t-av22-probes.LOCAL.sh
#
# Every cell is a real request with a real JWT (anon uses the anon key) through
# PostgREST against the LOCAL stack. A cell says what came back: a SQLSTATE,
# a row count, or a function's own answer. A write is judged by reading the
# database afterwards, never by the HTTP status.
#
# A write that lands changes the seed's state for the cells after it, so the
# state of the two seed partners is fingerprinted before every write cell and
# rebuilt (node scripts/av-seed-athletes.mjs) whenever it changed.
#
# LOCAL ONLY: refuses unless both the API and Postgres are on this machine.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
API="$NEXT_PUBLIC_SUPABASE_URL"; ANON="$NEXT_PUBLIC_SUPABASE_ANON_KEY"
PGURL="${AV_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
OUT="docs/T-AV22_PROBES.md"

is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$API"   || { echo "REFUSED: API is not local"; exit 2; }
is_local "$PGURL" || { echo "REFUSED: Postgres is not local"; exit 2; }

q() { psql -X -v ON_ERROR_STOP=1 -At -d "$PGURL" -c "$1" < /dev/null; }
reset() { node scripts/av-seed-athletes.mjs < /dev/null > /tmp/_tav22p_reset.out 2>&1 || { echo "FATAL: seed reset failed"; cat /tmp/_tav22p_reset.out; exit 1; }; }
ID() { printf '00000000-0000-4000-8000-%012d' "$1"; }
PX=5a5a5a5a-2200-4000-8000-00000000000c   # a probe partner with no program, for INSERT
cleanup() { q "delete from athlete_programs where partner_id='$PX'; delete from featured_partners where id='$PX'; delete from pass_leads where pass_code like 'TP-%';" >/dev/null; reset; }
trap cleanup EXIT

reset
PA=$(q "select id from featured_partners where user_id='$(ID 7)'")
PB=$(q "select id from featured_partners where user_id='$(ID 9)'")
SLUG_A=$(q "select slug from featured_partners where id='$PA'")
q "delete from athlete_programs where partner_id='$PX'; delete from featured_partners where id='$PX';" >/dev/null
q "insert into featured_partners (id, business_name, slug, business_type, status) values ('$PX','T-AV22 Probe Partner','tav22-probe-partner','gym','active');" >/dev/null
ANA_PA=$(ID 2001)
LEAD_C3=$(q "select id from pass_leads where pass_code='AV-CARC'")
LEAD_C5=$(q "select id from pass_leads where pass_code='AV-CARE'")
[ -n "$PA" ] && [ -n "$PB" ] && [ -n "$LEAD_C3" ] && [ -n "$LEAD_C5" ] \
  && [ "$(q "select count(*) from featured_partners where id='$PX'")" = 1 ] \
  && [ "$(q "select count(*) from athlete_programs where partner_id='$PX'")" = 0 ] || { echo "FATAL: fixtures missing"; exit 1; }

tok() { curl -s -X POST "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"tribe-local-1234\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))"; }
sub() { python3 -c "import sys,json,base64;p=sys.argv[1].split('.')[1];p+='='*(-len(p)%4);print(json.loads(base64.urlsafe_b64decode(p))['sub'])" "$1"; }

# role label | login (anon = the anon key) | expected user id
ROLES="anon|anon|-
athlete A (Ana)|ana|$(ID 1)
athlete B (Beto)|beto|$(ID 2)
guest-email user (Diego)|diego|$(ID 4)
active coach (Elena)|elena|$(ID 5)
inactive coach (Felipe)|felipe|$(ID 6)
other-partner coach (Gabi)|gabi|$(ID 10)
owner (BullBox)|bullbox|$(ID 7)
other-partner owner|otro|$(ID 9)
admin|admin|$(ID 8)"
while IFS='|' read -r label login uid; do
  if [ "$login" = anon ]; then eval "J_anon=\$ANON"; continue; fi
  t=$(tok "$login@av.local"); [ "$(sub "$t")" = "$uid" ] || { echo "FATAL: $login JWT did not decode to $uid"; exit 1; }
  eval "J_$login=\$t"
done <<< "$ROLES"
jwt() { local v="J_$1"; echo "${!v}"; }

fp() { q "select md5(coalesce((select string_agg(x::text,'' order by x::text) from athlete_programs x),'')
               || coalesce((select string_agg(x::text,'' order by x::text) from program_athletes x),'')
               || coalesce((select string_agg(x::text,'' order by x::text) from pass_leads x where partner_id in ('$PA','$PB')),''))"; }

# Summarize a PostgREST response: SQLSTATE if it is an error, else "N rows".
rows() { python3 -c "
import sys,json
b=sys.stdin.read()
try: d=json.loads(b)
except Exception: print('http '+sys.argv[1]); sys.exit()
if isinstance(d,dict) and 'code' in d: print(d['code'])
elif isinstance(d,list): print(f'{len(d)} rows')
else: print('http '+sys.argv[1])" "$1"; }
# Summarize an RPC answer: SQLSTATE, or ok / the function's error, plus a detail.
fn() { python3 -c "
import sys,json
b=sys.stdin.read()
try: d=json.loads(b)
except Exception: print('http '+sys.argv[1]); sys.exit()
def keys(o):
    if isinstance(o,dict):
        for k,v in o.items(): yield k; yield from keys(v)
    elif isinstance(o,list):
        for v in o: yield from keys(v)
if isinstance(d,dict) and 'code' in d and 'success' not in d: print(d['code'])
elif isinstance(d,list): print(f'{len(d)} rows')
elif isinstance(d,dict) and d.get('success') is False: print(d.get('error'))
elif isinstance(d,dict) and d.get('success'):
    extra=''
    if 'programs' in d: extra=f\": {len(d['programs'][0]['guests'])} guests\"
    elif 'athletes' in d: extra=' (with bonus)' if any('bonus' in k for k in keys(d)) else ' (no bonus field)'
    elif 'leads' in d: extra=f\": {len(d['leads'])} leads\"
    print('ok'+extra)
else: print(json.dumps(d)[:40])" "$1"; }

GET() { curl -s -w '\n%{http_code}' "$API/rest/v1/$2" -H "apikey: $ANON" -H "Authorization: Bearer $(jwt "$1")"; }
SEND() { curl -s -o /tmp/_tav22p.out -w '%{http_code}' -X "$2" "$API/rest/v1/$3" -H "apikey: $ANON" -H "Authorization: Bearer $(jwt "$1")" \
  -H 'Content-Type: application/json' -H 'Prefer: return=minimal' ${4:+-d "$4"}; }
RPC() { curl -s -w '\n%{http_code}' -X POST "$API/rest/v1/rpc/$2" -H "apikey: $ANON" -H "Authorization: Bearer $(jwt "$1")" -H 'Content-Type: application/json' -d "$3"; }

read_cell()  { local out; out=$(GET "$1" "$2"); echo "${out%$'\n'*}" | rows "${out##*$'\n'}"; }
rpc_cell()   { local out; out=$(RPC "$1" "$2" "$3"); echo "${out%$'\n'*}" | fn "${out##*$'\n'}"; }
# write_cell <role> <method> <path> <body> <sql that counts or reads the target>
write_cell() {
  local before after code err
  before=$(q "$5"); code=$(SEND "$1" "$2" "$3" "$4"); after=$(q "$5")
  err=$(python3 -c "import json;d=json.load(open('/tmp/_tav22p.out'));print(d.get('code',''))" 2>/dev/null)
  if [ "$before" != "$after" ]; then echo "WROTE ($before -> $after)"; else echo "${err:-http $code}, unchanged"; fi
}

TARGETS="t|athlete_programs|SELECT (rows, BullBox)
t|athlete_programs|SELECT conversion_bonus_cop
t|athlete_programs|INSERT (a partner with no program)
t|athlete_programs|UPDATE welcome_offer_en (BullBox)
t|athlete_programs|UPDATE is_active (BullBox)
t|athlete_programs|DELETE (Otro Gym's program)
t|program_athletes|SELECT (rows, BullBox)
t|program_athletes|SELECT email_lower
t|program_athletes|SELECT whatsapp_e164
t|program_athletes|INSERT
t|program_athletes|UPDATE level (Ana)
t|program_athletes|DELETE (Ana)
t|pass_leads|SELECT new columns (rows, BullBox)
t|pass_leads|INSERT with referred_by_athlete_id
t|pass_leads|INSERT a plain lead
f|av_my_partner_role(BullBox)|
f|av_athletes_ledger(BullBox)|
f|av_athletes_ledger_totals(BullBox)|
f|av_athletes_add(BullBox, Diego)|
f|av_athletes_set_status(Ana, paused)|
f|av_athletes_set_level(Ana, athlete)|
f|av_athletes_set_outcome(C6, not_now)|
f|av_athletes_mark_retained(C5)|
f|av_athletes_mark_bonus_settled(C3)|
f|av_athletes_my_summary()|
f|av_athletes_partner_summary(BullBox)|
f|av_door_list(BullBox)|
f|av_door_pass(C2)|"

cell() { # cell <target index> <role login>
  local r=$2
  case $1 in
    1)  read_cell $r "athlete_programs?select=partner_id&partner_id=eq.$PA" ;;
    2)  read_cell $r "athlete_programs?select=conversion_bonus_cop&partner_id=eq.$PA" ;;
    3)  write_cell $r POST athlete_programs "{\"partner_id\":\"$PX\"}" "select count(*) from athlete_programs where partner_id='$PX'"
        q "delete from athlete_programs where partner_id='$PX';" >/dev/null ;;
    4)  write_cell $r PATCH "athlete_programs?partner_id=eq.$PA" '{"welcome_offer_en":"Probe"}' "select welcome_offer_en from athlete_programs where partner_id='$PA'" ;;
    5)  write_cell $r PATCH "athlete_programs?partner_id=eq.$PA" '{"is_active":false}' "select is_active from athlete_programs where partner_id='$PA'" ;;
    6)  write_cell $r DELETE "athlete_programs?partner_id=eq.$PB" '' "select count(*) from athlete_programs where partner_id='$PB'" ;;
    7)  read_cell $r "program_athletes?select=id&partner_id=eq.$PA" ;;
    8)  read_cell $r "program_athletes?select=email_lower&partner_id=eq.$PA" ;;
    9)  read_cell $r "program_athletes?select=whatsapp_e164&partner_id=eq.$PA" ;;
    10) write_cell $r POST program_athletes "{\"partner_id\":\"$PA\",\"user_id\":\"$(ID 4)\",\"ref_code\":\"PROBE-XYZ\",\"email_lower\":\"diego@av.local\"}" "select count(*) from program_athletes where partner_id='$PA'" ;;
    11) write_cell $r PATCH "program_athletes?id=eq.$ANA_PA" '{"level":"athlete"}' "select level from program_athletes where id='$ANA_PA'" ;;
    12) write_cell $r DELETE "program_athletes?id=eq.$ANA_PA" '' "select count(*) from program_athletes where id='$ANA_PA'" ;;
    13) read_cell $r "pass_leads?select=referred_by_athlete_id,bonus_eligible&partner_id=eq.$PA" ;;
    14) write_cell $r POST pass_leads "{\"slug\":\"$SLUG_A\",\"partner_id\":\"$PA\",\"name\":\"Probe Forge\",\"whatsapp\":\"+573001112233\",\"email\":\"forge@example.invalid\",\"pass_code\":\"TP-FRGA\",\"consent_text\":\"Autorizo a Tribe a compartir mis datos con el aliado.\",\"referred_by_athlete_id\":\"$ANA_PA\"}" "select count(*) from pass_leads where pass_code='TP-FRGA'"
        q "delete from pass_leads where pass_code like 'TP-%';" >/dev/null ;;
    15) write_cell $r POST pass_leads "{\"slug\":\"$SLUG_A\",\"partner_id\":\"$PA\",\"name\":\"Probe Plain\",\"whatsapp\":\"+573001112233\",\"email\":\"plain@example.invalid\",\"pass_code\":\"TP-PLNA\",\"consent_text\":\"Autorizo a Tribe a compartir mis datos con el aliado.\"}" "select count(*) from pass_leads where pass_code='TP-PLNA'"
        q "delete from pass_leads where pass_code like 'TP-%';" >/dev/null ;;
    16) rpc_cell $r av_my_partner_role "{\"p_partner_id\":\"$PA\"}" ;;
    17) rpc_cell $r av_athletes_ledger "{\"p_partner_id\":\"$PA\"}" ;;
    18) rpc_cell $r av_athletes_ledger_totals "{\"p_partner_id\":\"$PA\"}" ;;
    19) rpc_cell $r av_athletes_add "{\"p_partner_id\":\"$PA\",\"p_user_id\":\"$(ID 4)\",\"p_whatsapp\":null}" ;;
    20) rpc_cell $r av_athletes_set_status "{\"p_program_athlete_id\":\"$ANA_PA\",\"p_status\":\"paused\"}" ;;
    21) rpc_cell $r av_athletes_set_level "{\"p_program_athlete_id\":\"$ANA_PA\",\"p_level\":\"athlete\"}" ;;
    22) rpc_cell $r av_athletes_set_outcome '{"p_pass_code":"AV-CARF","p_outcome":"not_now"}' ;;
    23) rpc_cell $r av_athletes_mark_retained "{\"p_lead_id\":\"$LEAD_C5\"}" ;;
    24) rpc_cell $r av_athletes_mark_bonus_settled "{\"p_lead_id\":\"$LEAD_C3\"}" ;;
    25) rpc_cell $r av_athletes_my_summary '{}' ;;
    26) rpc_cell $r av_athletes_partner_summary "{\"p_partner_id\":\"$PA\"}" ;;
    27) rpc_cell $r av_door_list "{\"p_partner_id\":\"$PA\"}" ;;
    28) rpc_cell $r av_door_pass '{"p_pass_code":"AV-CARB"}' ;;
  esac
}

LOGINS=$(echo "$ROLES" | cut -d'|' -f2 | tr '\n' ' ')
HEAD=$(echo "$ROLES" | cut -d'|' -f1 | tr '\n' '|' | sed 's/|$//')
BASE=$(fp)
TMP=$(mktemp)
i=0
while IFS='|' read -r kind name what; do
  i=$((i+1))
  if [ "$kind" = t ]; then row="| \`$name\` | $what |"; else row="| \`$name\` | EXECUTE |"; fi
  for r in $LOGINS; do
    c=$(cell $i $r | tr -d '\n')
    row="$row $c |"
    if [ "$(fp)" != "$BASE" ]; then reset; BASE=$(fp); fi
  done
  echo "$row" >> "$TMP"
  printf '.'
done <<< "$TARGETS"
echo

{
  echo "# T-AV22 probe matrix"
  echo
  echo "Generated $(date -u '+%Y-%m-%d %H:%M UTC') by \`supabase/recon/t-av22-probes.LOCAL.sh\` against the LOCAL stack"
  echo "(8200 to 8207 applied, \`npm run av:seed\`), on branch \`$(git rev-parse --abbrev-ref HEAD)\` at \`$(git rev-parse --short HEAD)\` plus the uncommitted T-AV22 work."
  echo
  echo "Every cell is a real request with that role's JWT (anon: the anon key) through PostgREST."
  echo "Reads show a row count or the SQLSTATE. Writes are judged by reading the database afterwards:"
  echo "\`WROTE (before -> after)\` means the write landed; anything else is the SQLSTATE or HTTP status and \`unchanged\`."
  echo "Functions show \`ok\`, the function's own refusal (\`not_found\`, \`not_allowed\`, ...) or the SQLSTATE."
  echo "The state is rebuilt after any cell that changed it, so every cell starts from the seed."
  echo
  echo "Legend: \`42501\` insufficient privilege (grant or the admin guard); \`PGRST205\`/\`PGRST202\` not exposed to that role;"
  echo "\`not_found\` is the single refusal the definer functions give an unauthorized caller and a missing object alike."
  echo
  echo "| object | operation | $HEAD |"
  printf '|---|---|'; for r in $LOGINS; do printf -- '---|'; done; echo
  cat "$TMP"
} > "$OUT"
rm -f "$TMP"
echo "wrote $OUT ($i targets x $(echo $LOGINS | wc -w | tr -d ' ') roles)"
