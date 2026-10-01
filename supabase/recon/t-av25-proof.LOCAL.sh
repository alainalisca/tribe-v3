#!/bin/bash
# T-AV25 acceptance proof: the door, end to end, against the LOCAL stack
# (8200 to 8207, `npm run av:seed`), through a dev:av on the proof port.
#
#   bash supabase/recon/t-av25-proof.LOCAL.sh            # every test
#   ONLY="4 6" bash supabase/recon/t-av25-proof.LOCAL.sh  # a subset (the mutation driver uses this)
#
# Pages are fetched with real SSR session cookies (scripts/avSessionCookie.mjs);
# the client actions a button would take (confirm, outcome, the code field's
# lookup) are the same RPCs called with the same user's JWT through PostgREST.
# The verify page's chosen confirm method is read from its RSC payload, which
# is the prop the confirm button will send.
#
# Seed: BullBox (Prueba) is partner A (coach Elena active, Felipe inactive),
# Otro Gym (Prueba) is partner B (coach Gabi). AV-CARA and AV-CARM are Caro's
# guests, not yet attended; AV-OTRO is partner B's pass.
#
# LOCAL ONLY, and refuses to start if something it did not start is on the port.
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
reset() { node scripts/av-seed-athletes.mjs < /dev/null > "$TMP/reset.out" 2>&1 || { echo "FATAL: seed reset failed"; cat "$TMP/reset.out"; exit 1; }; }
cleanup() { stop_server; reset; rm -rf "$TMP"; }

if port_busy; then echo "REFUSED: something is already listening on $AV_PROOF_PORT; stop it first"; exit 2; fi
trap cleanup EXIT
reset
PA=$(q "select id from featured_partners where user_id='00000000-0000-4000-8000-000000000007'")
PB=$(q "select id from featured_partners where user_id='00000000-0000-4000-8000-000000000009'")
[ -n "$PA" ] && [ -n "$PB" ] || { echo "FATAL: seed partners missing"; exit 1; }
[ "$(q "select count(*) from pass_leads where pass_code in ('AV-CARA','AV-CARM') and attended_at is null")" = 2 ] || { echo "FATAL: the two unattended seed passes are missing"; exit 1; }
[ "$(q "select count(*) from partner_instructors where partner_id='$PB' and instructor_id='00000000-0000-4000-8000-000000000010' and is_active is true")" = 1 ] || { echo "FATAL: partner B coach missing"; exit 1; }

for who in elena gabi caro; do
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
rscp() { curl -s -o "$TMP/p.rsc" -w '%{http_code}' -H "Cookie: $(cookie "$1")" -H 'RSC: 1' "$APP$2"; }
rpc() { curl -s -X POST "$API/rest/v1/rpc/$2" -H "apikey: $ANON" -H "Authorization: Bearer $(jwt "$1")" -H 'Content-Type: application/json' -d "$3"; }
row() { q "select coalesce(attended_method,'NULL')||'|'||coalesce(outcome,'NULL') from pass_leads where pass_code='$1'"; }
codes_in() { python3 -c "import re,sys;print(','.join(sorted(set(re.findall(r'data-door-row=\"([A-Z]{2}-[A-Z2-9]{4})\"', open(sys.argv[1],encoding='utf-8').read())))))" "$1"; }
metric() { python3 -c "import re,sys;m=re.search(r'data-metric=\"'+sys.argv[2]+r'\"[^>]*>(\d+)<', open(sys.argv[1],encoding='utf-8').read());print(m.group(1) if m else '')" "$1" "$2"; }
NOTFOUND='{"error": "not_found", "success": false}'

pass=0; fail=0
ok()  { printf "  PASS  %s\n" "$1"; pass=$((pass+1)); }
bad() { printf "  FAIL  %s\n" "$1"; fail=$((fail+1)); }

if want 1; then
  start_server off; echo "dev:av up, flag=off"; echo
  echo "== 1. flag off: the door list is a real 404 (middleware gate)"
  c=$(page elena "/atletas/gym/$PA/puerta/")
  [ "$c" = 404 ] && ! grep -q 'data-door-row' "$TMP/p.html" && ok "Elena, /atletas/gym/{A}/puerta/: http $c, no rows" || bad "flag-off list: http $c"
fi

if want 2 || want 3 || want 4 || want 5 || want 6 || want 7; then start_server all; echo; echo "dev:av up, flag=all"; echo; fi

if want 2; then echo "== 2. verify page: invitation, then confirm, then the offer and the outcomes; the method the page will send"
  page elena /pase/verificar/AV-CARA/ > /dev/null
  grep -q 'data-invited-by' "$TMP/p.html" && grep -q 'Caro' "$TMP/p.html" && ! grep -q 'data-welcome-offer' "$TMP/p.html" && ! grep -q 'data-outcome=' "$TMP/p.html" \
    && ok "before confirm: invitation from Caro, no offer, no outcomes" || bad "verify page before confirm"
  r=$(rpc elena av_confirm_pass_attendance '{"p_pass_code":"AV-CARA","p_method":"scan"}')
  [ "$(row AV-CARA)" = "scan|NULL" ] && ok "confirm by scan: attended_method scan stored" || bad "scan confirm: $r / $(row AV-CARA)"
  page elena /pase/verificar/AV-CARA/ > /dev/null
  grep -q 'data-welcome-offer' "$TMP/p.html" && [ "$(grep -o 'data-outcome="[a-z_]*"' "$TMP/p.html" | sort -u | wc -l | tr -d ' ')" = 4 ] \
    && ok "after confirm: the welcome offer and the four outcome buttons" || bad "verify page after confirm"
  for row in "?via=code|code" "|scan" "?via=toggle|scan" "?via=anything|scan"; do
    IFS='|' read -r qs want_m <<< "$row"
    rscp elena "/pase/verificar/AV-CARM/$qs" > /dev/null
    got=$(python3 -c "import re,sys;m=re.search(r'\"method\":\"([a-z]+)\"', open(sys.argv[1],encoding='utf-8',errors='replace').read());print(m.group(1) if m else '')" "$TMP/p.rsc")
    [ "$got" = "$want_m" ] && ok "verify page${qs:- (no query)}: confirms with method $got" || bad "verify page$qs: method '$got', want $want_m"
  done
  r=$(rpc elena av_confirm_pass_attendance '{"p_pass_code":"AV-CARM","p_method":"code"}')
  [ "$(row AV-CARM)" = "code|NULL" ] && ok "a typed code's confirm stores attended_method code" || bad "code confirm: $r / $(row AV-CARM)"
  reset
fi

if want 3; then echo "== 3. joined before the show-up is refused"
  r=$(rpc elena av_athletes_set_outcome '{"p_pass_code":"AV-CARM","p_outcome":"joined"}')
  [[ "$r" == *not_attended* ]] && [ "$(row AV-CARM)" = "NULL|NULL" ] && ok "joined on an unconfirmed pass: not_attended, row unchanged" || bad "joined before confirm: $r / $(row AV-CARM)"
  rpc elena av_confirm_pass_attendance '{"p_pass_code":"AV-CARM","p_method":"toggle"}' > /dev/null
  r=$(rpc elena av_athletes_set_outcome '{"p_pass_code":"AV-CARM","p_outcome":"joined"}')
  [ "$(row AV-CARM)" = "toggle|joined" ] && ok "after the show-up (toggle), joined is saved" || bad "joined after confirm: $r / $(row AV-CARM)"
  reset
fi

if want 4; then echo "== 4. the door list: this partner's passes from the last 14 days, and nothing else"
  c=$(page elena "/atletas/gym/$PA/puerta/")
  want_codes=$(q "select string_agg(pass_code, ',' order by pass_code) from pass_leads where partner_id='$PA' and created_at >= now() - interval '14 days'")
  got_codes=$(codes_in "$TMP/p.html")
  [ "$c" = 200 ] && [ -n "$got_codes" ] && [ "$got_codes" = "$want_codes" ] && ok "Elena: http $c, exactly the $(echo "$got_codes" | tr ',' '\n' | wc -l | tr -d ' ') passes the database says" || bad "list: http $c got=[$got_codes] want=[$want_codes]"
  ! grep -q 'AV-OTRO' "$TMP/p.html" && ok "no pass of another partner (AV-OTRO absent)" || bad "the list shows another partner's pass"
  [[ "$(cat "$TMP/p.html")" != *"@guest.local"* && "$(cat "$TMP/p.html")" != *"+57300555"* ]] && ok "no guest email or WhatsApp" || bad "the list leaks contact details"
fi

if want 5; then echo "== 5. the other partner's coach is refused on all three paths"
  page gabi /pase/verificar/AV-CARA/ > /dev/null
  grep -qE 'This pass is not for your gym|Este pase no es de tu gimnasio' "$TMP/p.html" && ! grep -q 'data-invited-by' "$TMP/p.html" \
    && ok "verify page: the one refusal sentence, nothing of the pass" || bad "Gabi verify page"
  # T-AV26 (Al's decision 2, 2026-10-01): middleware now asks av_my_partner_role
  # for /atletas/gym/{id}/**, so another gym's coach gets a REAL 404 before any
  # rendering. Before T-AV26 this was a page-level notFound(), streamed as 200
  # with Next's not-found signal (decision 4). What must hold either way: no
  # rows, and the SAME answer a partner that does not exist gets, so the list
  # cannot reveal who works where.
  c=$(page gabi "/atletas/gym/$PA/puerta/"); gabi_rows=$(grep -c 'data-door-row' "$TMP/p.html"); cp "$TMP/p.html" "$TMP/gabi.html"
  c2=$(page elena "/atletas/gym/00000000-0000-4000-8000-0000000000ff/puerta/")
  [ "$gabi_rows" = 0 ] && [ "$c" = 404 ] && [ "$c2" = 404 ] \
    && ok "door list of partner A: a real 404 with no rows, the same answer as a partner that does not exist" \
    || bad "Gabi list: http $c rows=$gabi_rows | unknown partner: http $c2"
  real=$(rpc gabi av_door_pass '{"p_pass_code":"AV-CARA"}'); fake=$(rpc gabi av_door_pass '{"p_pass_code":"ZZ-2345"}')
  [ "$real" = "$NOTFOUND" ] && [ "$fake" = "$real" ] && ok "code field lookup: a real code and a made-up one answer byte for byte the same" || bad "Gabi lookup: real=$real fake=$fake"
  r=$(rpc gabi av_athletes_set_outcome '{"p_pass_code":"AV-CARB","p_outcome":"not_now"}')
  [ "$r" = "$NOTFOUND" ] && [ "$(row AV-CARB)" = "scan|NULL" ] && ok "outcome: not_found, row unchanged" || bad "Gabi outcome: $r / $(row AV-CARB)"
fi

if want 6; then echo "== 6. the code field: unknown and other-gym codes get the same answer"
  unknown=$(rpc elena av_door_pass '{"p_pass_code":"ZZ-2345"}'); other=$(rpc elena av_door_pass '{"p_pass_code":"AV-OTRO"}')
  [ "$unknown" = "$NOTFOUND" ] && [ "$other" = "$unknown" ] && ok "Elena: unknown code and partner B's code, byte for byte the same" || bad "unknown=$unknown other=$other"
  own=$(rpc elena av_door_pass '{"p_pass_code":"AV-CARB"}')
  [[ "$own" == *'"success": true'* ]] && ok "her own gym's code resolves (so the two refusals above are about the code, not the coach)" || bad "own code: $own"
fi

if want 7; then echo "== 7. the athlete's home updates after a door confirm"
  page caro /atletas/ > /dev/null; before=$(metric "$TMP/p.html" showedUp)
  rpc elena av_confirm_pass_attendance '{"p_pass_code":"AV-CARA","p_method":"scan"}' > /dev/null
  page caro /atletas/ > /dev/null; after=$(metric "$TMP/p.html" showedUp)
  [ -n "$before" ] && [ "$after" = "$((before + 1))" ] && ok "Caro's Llegaron: $before -> $after on refresh" || bad "athlete home: before=$before after=$after"
  reset
fi

echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" = 0 ]
