#!/bin/bash
# T-AV26 acceptance proof: the gym dashboard, settings and Add athlete, against
# the LOCAL stack (8200 to 8208, `npm run av:seed`), through a dev:av on the
# proof port.
#
#   bash supabase/recon/t-av26-proof.LOCAL.sh            # every test
#   ONLY="5" bash supabase/recon/t-av26-proof.LOCAL.sh   # a subset (the mutation driver uses this)
#
# Pages and the settings route are fetched with real SSR session cookies
# (scripts/avSessionCookie.mjs). The client actions a button takes (search,
# add, level, contacted) are the same RPCs called with the same user's JWT
# through PostgREST.
#
# Seed: BullBox (Prueba) is partner A, owner bullbox@, coach Elena active,
# Felipe inactive. Otro Gym (Prueba) is partner B, owner otro@, coach Gabi.
# Ana and Beto are captains (Beto ready at 10 of 10), Caro an athlete.
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
reset() {
  node scripts/av-seed-athletes.mjs < /dev/null > "$TMP/reset.out" 2>&1 || { echo "FATAL: seed reset failed"; cat "$TMP/reset.out"; exit 1; }
  q "delete from rate_limits where key like 'av_athletes_search:%'" > /dev/null
}
cleanup() { stop_server; reset; rm -rf "$TMP"; }

if port_busy; then echo "REFUSED: something is already listening on $AV_PROOF_PORT; stop it first"; exit 2; fi
trap cleanup EXIT
reset
ID() { printf '00000000-0000-4000-8000-%012d' "$1"; }
PA=$(q "select id from featured_partners where user_id='$(ID 7)'")
PB=$(q "select id from featured_partners where user_id='$(ID 9)'")
[ -n "$PA" ] && [ -n "$PB" ] || { echo "FATAL: seed partners missing"; exit 1; }
[ "$(q "select count(*) from pg_proc where proname='av_athletes_search_candidates'")" = 1 ] || { echo "FATAL: 8208 is not applied"; exit 1; }

for who in bullbox elena felipe otro admin ana gabi; do
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
anon_page() { curl -s -o "$TMP/p.html" -w '%{http_code}' "$APP$1"; }
rpc() { curl -s -X POST "$API/rest/v1/rpc/$2" -H "apikey: $ANON" -H "Authorization: Bearer $(jwt "$1")" -H 'Content-Type: application/json' -d "$3"; }
# The owner's current settings as the form would send them, with one field overridden.
settings_body() { # settings_body <field> <value-json>
  rpc bullbox av_athletes_partner_summary "{\"p_partner_id\":\"$PA\"}" | python3 -c "
import sys, json
p = json.load(sys.stdin)['program']
keys = ['welcome_offer_en','welcome_offer_es','showup_reward_en','showup_reward_es','class_access_en','class_access_es',
        'conversion_bonus_note_en','conversion_bonus_note_es','conversion_bonus_cop','retention_days','promote_at_showups',
        'max_athletes','pilot_starts_on','pilot_ends_on']
b = {k: p.get(k) for k in keys}
b[sys.argv[1]] = json.loads(sys.argv[2])
print(json.dumps(b))" "$1" "$2"
}
save() { # save <who> <body>: the settings route, as the form calls it
  curl -s -o "$TMP/save.json" -w '%{http_code}' -X POST -H "Cookie: $(cookie "$1")" -H 'Content-Type: application/json' \
    -d "$2" "$APP/api/atletas/gym/$PA/settings/"
}
showup_es() { q "select coalesce(showup_reward_es,'NULL') from athlete_programs where partner_id='$PA'"; }
funnel() { python3 -c "import re,sys;m=re.search(r'data-funnel=\"'+sys.argv[2]+r'\"[^>]*data-value=\"(\d+)\"', open(sys.argv[1],encoding='utf-8').read());print(m.group(1) if m else '')" "$1" "$2"; }

pass=0; fail=0
ok()  { printf "  PASS  %s\n" "$1"; pass=$((pass+1)); }
bad() { printf "  FAIL  %s\n" "$1"; fail=$((fail+1)); }

if want 1; then
  start_server off; echo "dev:av up, flag=off"; echo
  echo "== 1. flag off: the dashboard, settings and the settings route are real 404s"
  c1=$(page bullbox "/atletas/gym/$PA/"); c2=$(page bullbox "/atletas/gym/$PA/ajustes/")
  c3=$(save bullbox "$(settings_body showup_reward_es '"flag off"')")
  [ "$c1" = 404 ] && [ "$c2" = 404 ] && [ "$c3" = 404 ] && [ "$(showup_es)" != "flag off" ] \
    && ok "owner: dashboard $c1, settings $c2, route $c3, nothing saved" || bad "flag off: $c1 $c2 $c3 / $(showup_es)"
fi

if want 2 || want 3 || want 4 || want 5 || want 6 || want 7 || want 8; then start_server all; echo; echo "dev:av up, flag=all"; echo; fi

if want 2; then echo "== 2. who reaches what: a REAL status from middleware, by role"
  for r in "bullbox|/|200" "elena|/|200" "admin|/|200" "felipe|/|404" "otro|/|404" "gabi|/|404" \
           "bullbox|/ajustes/|200" "admin|/ajustes/|200" "elena|/ajustes/|404" "otro|/ajustes/|404" \
           "elena|/puerta/|200" "otro|/puerta/|404" "ana|/|404"; do
    IFS='|' read -r who sub want_c <<< "$r"
    c=$(page "$who" "/atletas/gym/$PA$sub")
    [ "$c" = "$want_c" ] && ok "$who on /atletas/gym/{A}$sub: http $c" || bad "$who on $sub: http $c, want $want_c"
  done
  c=$(page bullbox "/atletas/gym/$(ID 255)/"); [ "$c" = 404 ] && ok "a partner that does not exist: http $c, the same as another gym" || bad "unknown partner: http $c"
  c=$(page bullbox "/atletas/gym/bullbox/"); [ "$c" = 404 ] && ok "a malformed partner id: http $c" || bad "malformed id: http $c"
  c=$(anon_page "/atletas/gym/$PA/"); loc=$(curl -s -o /dev/null -w '%{redirect_url}' "$APP/atletas/gym/$PA/")
  [[ "$c" = 30[27] && "$loc" == *"/auth"* ]] && ok "signed out: http $c to /auth, as any unknown private path" || bad "signed out: http $c -> $loc"
  page bullbox "/atletas/gym/$PA/" > /dev/null
  grep -q "href=\"/atletas/gym/$PA/puerta/\"" "$TMP/p.html" && ok "the dashboard links to the door list" || bad "no door-list link"
fi

if want 3; then echo "== 3. every number on the Resumen is av_athletes_partner_summary's"
  page bullbox "/atletas/gym/$PA/" > /dev/null
  rpc bullbox av_athletes_partner_summary "{\"p_partner_id\":\"$PA\"}" > "$TMP/sum.json"
  for k in invited:invited showed_up:showed_up joined:joined retained:retained to_close:to_close bonus_owed:bonus_owed bonus_paid:bonus_settled; do
    attr=${k%%:*}; key=${k##*:}
    want_v=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['totals'][sys.argv[2]])" "$TMP/sum.json" "$key")
    got=$(funnel "$TMP/p.html" "$attr")
    [ -n "$got" ] && [ "$got" = "$want_v" ] && ok "$attr: page $got = summary $want_v" || bad "$attr: page '$got', summary $want_v"
  done
  want_tc=$(q "select count(*) from public.pass_leads pl join public.program_athletes pa on pa.id = pl.referred_by_athlete_id where pl.partner_id='$PA' and pl.attended_at is not null and pl.outcome is null and pa.partner_id='$PA'")
  got_tc=$(funnel "$TMP/p.html" to_close)
  echo "        (independent count of attributed show-ups with no outcome: $want_tc; the summary also drops not-credited ones)"
  [ -n "$got_tc" ] && [ "$got_tc" -le "$want_tc" ] && [ "$got_tc" -gt 0 ] && ok "Por cerrar ($got_tc) is a credited subset of the raw show-ups with no outcome ($want_tc)" || bad "to_close $got_tc vs raw $want_tc"
fi

if want 4; then echo "== 4. the coach's payload carries no bonus field, no sales note, no contact"
  page bullbox "/atletas/gym/$PA/" > /dev/null; cp "$TMP/p.html" "$TMP/owner.html"
  page elena "/atletas/gym/$PA/" > /dev/null; cp "$TMP/p.html" "$TMP/coach.html"
  grep -q 'bonusOwed' "$TMP/owner.html" && grep -q 'contactedAt' "$TMP/owner.html" \
    && ok "owner page carries bonusOwed and contactedAt (so the absence below is meaningful)" || bad "owner page lacks the owner fields"
  # Every page carries the viewer's OWN auth user (root layout), so Elena's
  # address is expected; any other address on the page would be a leak.
  leaks=""; for k in bonusOwed bonusPaid bonusSettledAt contactedAt retainFrom conversion_bonus @guest.local +5730011100 data-settings-link data-money-note data-funnel=\"bonus_owed\"; do
    grep -qF "$k" "$TMP/coach.html" && leaks="$leaks $k"; done
  others=$(grep -oE '[a-z.]+@av\.local' "$TMP/coach.html" | sort -u | grep -v '^elena@av\.local$' | tr '\n' ' ')
  [ -n "$others" ] && leaks="$leaks $others"
  grep -qF 'elena@av.local' "$TMP/coach.html" || leaks="$leaks (the viewer's own address is missing: the page shape changed, re-check this filter)"
  [ -z "$leaks" ] && ok "coach page: none of the owner-only keys, contact details, settings link or money note" || bad "coach page leaks:$leaks"
  rpc elena av_athletes_partner_summary "{\"p_partner_id\":\"$PA\"}" > "$TMP/coach.json"
  bad_keys=$(python3 - "$TMP/coach.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); found = set()
def walk(x):
    if isinstance(x, dict):
        for k, v in x.items():
            if 'bonus' in k or k in ('contacted_at', 'retain_from', 'email_lower', 'whatsapp_e164'): found.add(k)
            walk(v)
    elif isinstance(x, list):
        for v in x: walk(v)
walk(d); print(','.join(sorted(found)))
PY
)
  [ -z "$bad_keys" ] && [ "$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['role'])" "$TMP/coach.json")" = coach ] \
    && ok "partner_summary as the coach: role coach, no bonus/contact/sales key at any depth" || bad "coach summary keys: $bad_keys"
fi

if want 5; then echo "== 5. settings save through the owner's own session; a coach and another gym cannot"
  marker="Premio de prueba T-AV26 $$"
  c=$(save elena "$(settings_body showup_reward_es "\"coach $marker\"")")
  [ "$c" = 404 ] && [ "$(showup_es)" != "coach $marker" ] && ok "coach Elena: http $c, nothing saved" || bad "coach save: http $c / $(showup_es)"
  c=$(save otro "$(settings_body showup_reward_es "\"otro $marker\"")")
  [ "$c" = 404 ] && [ "$(showup_es)" != "otro $marker" ] && ok "other gym's owner: http $c, nothing saved" || bad "other owner save: http $c / $(showup_es)"
  c=$(save bullbox "$(settings_body showup_reward_es "\"$marker\"")")
  [ "$c" = 200 ] && [ "$(showup_es)" = "$marker" ] && ok "owner: http $c, showup_reward_es saved" || bad "owner save: http $c $(cat "$TMP/save.json") / $(showup_es)"
  page ana /atletas/ > /dev/null
  grep -qF "$marker" "$TMP/p.html" && ok "Ana's athlete home shows the new show-up reward" || bad "athlete home does not show the new text"
  before=$(q "select is_active::text||'|'||partner_id from athlete_programs where partner_id='$PA'")
  body=$(settings_body retention_days 45 | python3 -c "import sys,json;b=json.load(sys.stdin);b['is_active']=False;b['partner_id']='$PB';print(json.dumps(b))")
  c=$(save bullbox "$body")
  after=$(q "select is_active::text||'|'||partner_id from athlete_programs where partner_id='$PA'")
  [ "$c" = 200 ] && [ "$before" = "$after" ] && [ "$(q "select retention_days from athlete_programs where partner_id='$PA'")" = 45 ] \
    && ok "is_active and partner_id in the body are ignored; the allowed field saved" || bad "allowlist: http $c $before -> $after"
  c=$(save bullbox "$(settings_body retention_days 3)")
  [ "$c" = 400 ] && grep -q retention_days "$TMP/save.json" && ok "out of range: http $c naming the field" || bad "validation: http $c $(cat "$TMP/save.json")"
  c=$(save admin "$(settings_body class_access_es '"admin edit"')")
  [ "$c" = 200 ] && [ "$(q "select class_access_es from athlete_programs where partner_id='$PA'")" = "admin edit" ] && ok "admin: http $c, saved" || bad "admin save: http $c"
  reset
fi

if want 6; then echo "== 6. Add athlete: search reveals a name and a photo only; cap and duplicates refused"
  r=$(rpc bullbox av_athletes_search_candidates "{\"p_partner_id\":\"$PA\",\"p_query\":\"die\"}")
  keys=$(echo "$r" | python3 -c "import sys,json;d=json.load(sys.stdin);print(','.join(sorted({k for x in d.get('results',[]) for k in x})) + '|' + ','.join(x['name'] for x in d.get('results',[])))")
  [ "$keys" = "avatar_url,id,name|Diego Prueba" ] && ok "name search 'die': Diego, keys avatar_url,id,name only" || bad "name search: $r"
  r1=$(rpc bullbox av_athletes_search_candidates "{\"p_partner_id\":\"$PA\",\"p_query\":\"diego@av.local\"}")
  r2=$(rpc bullbox av_athletes_search_candidates "{\"p_partner_id\":\"$PA\",\"p_query\":\"diego@av\"}")
  [[ "$r1" == *"Diego Prueba"* && "$r1" != *"@"* && "$r2" == *'"results": []'* ]] && ok "email: the exact address finds Diego (no email echoed); a prefix finds nobody" || bad "email: $r1 / $r2"
  r=$(rpc bullbox av_athletes_search_candidates "{\"p_partner_id\":\"$PA\",\"p_query\":\"di\"}")
  [[ "$r" == *too_short* ]] && ok "two characters: too_short" || bad "short: $r"
  for who in elena otro; do r=$(rpc "$who" av_athletes_search_candidates "{\"p_partner_id\":\"$PA\",\"p_query\":\"ana\"}")
    [[ "$r" == *not_found* ]] && ok "$who searching partner A: not_found" || bad "$who search: $r"; done
  q "insert into rate_limits(key) select 'av_athletes_search:$(ID 7)' from generate_series(1, 30 - (select count(*) from rate_limits where key='av_athletes_search:$(ID 7)' and created_at > now() - interval '1 hour'))" > /dev/null
  r=$(rpc bullbox av_athletes_search_candidates "{\"p_partner_id\":\"$PA\",\"p_query\":\"ana\"}")
  [[ "$r" == *rate_limited* ]] && ok "the 31st search in an hour: rate_limited" || bad "rate limit: $r"
  r=$(rpc bullbox av_athletes_add "{\"p_partner_id\":\"$PA\",\"p_user_id\":\"$(ID 4)\",\"p_whatsapp\":\"+573005559876\"}")
  [ "$(q "select whatsapp_e164||'|'||level||'|'||status from program_athletes where partner_id='$PA' and user_id='$(ID 4)'")" = "+573005559876|captain|active" ] \
    && ok "owner adds Diego with an E.164 WhatsApp: a captain, active" || bad "add: $r"
  r=$(rpc bullbox av_athletes_add "{\"p_partner_id\":\"$PA\",\"p_user_id\":\"$(ID 4)\",\"p_whatsapp\":null}")
  [[ "$r" == *already_added* ]] && ok "adding him again: already_added" || bad "duplicate: $r"
  c=$(save bullbox "$(settings_body max_athletes 4)")
  r=$(rpc bullbox av_athletes_add "{\"p_partner_id\":\"$PA\",\"p_user_id\":\"$(ID 6)\",\"p_whatsapp\":null}")
  [ "$c" = 200 ] && [[ "$r" == *program_full* ]] && [ "$(q "select count(*) from program_athletes where partner_id='$PA' and user_id='$(ID 6)'")" = 0 ] \
    && ok "max set to 4 through the route, a fifth athlete: program_full, no row" || bad "cap: http $c / $r"
  r=$(rpc elena av_athletes_add "{\"p_partner_id\":\"$PA\",\"p_user_id\":\"$(ID 6)\",\"p_whatsapp\":null}")
  [[ "$r" == *not_found* ]] && ok "a coach adding: not_found" || bad "coach add: $r"
  reset
fi

if want 7; then echo "== 7. Promote: the UI offers it only for the ready captain; the function lets the owner choose"
  page bullbox "/atletas/gym/$PA/" > /dev/null
  ready=$(python3 - "$TMP/p.html" <<'PY'
import re, sys
s = open(sys.argv[1], encoding='utf-8').read().replace('\\"', '"')
print(','.join(sorted(set(m for m, r in re.findall(r'"firstName":"([^"]+)","level":"captain"[^}]*?"readyToPromote":(true|false)', s) if r == 'true'))))
PY
)
  [ "$ready" = "Beto" ] && ok "the page's view marks exactly one ready captain: $ready" || bad "ready captains in the view: '$ready'"
  r=$(rpc bullbox av_athletes_set_level "{\"p_program_athlete_id\":\"$(ID 2002)\",\"p_level\":\"athlete\"}")
  [ "$(q "select level from program_athletes where id='$(ID 2002)'")" = athlete ] && ok "owner promotes Beto: level athlete" || bad "promote Beto: $r"
  r=$(rpc bullbox av_athletes_set_level "{\"p_program_athlete_id\":\"$(ID 2001)\",\"p_level\":\"athlete\"}")
  [ "$(q "select level from program_athletes where id='$(ID 2001)'")" = athlete ] && ok "the function still lets the owner promote Ana, not ready (owner's choice)" || bad "promote Ana: $r"
  r=$(rpc elena av_athletes_set_level "{\"p_program_athlete_id\":\"$(ID 2003)\",\"p_level\":\"captain\"}")
  [[ "$r" == *not_found* ]] && [ "$(q "select level from program_athletes where id='$(ID 2003)'")" = athlete ] && ok "a coach changing a level: not_found, unchanged" || bad "coach level: $r"
  reset
fi

if want 8; then echo "== 8. Oferta enviada is set_pass_lead_contacted, owner only, and the summary reads it back"
  lead=$(q "select id from pass_leads where pass_code='AV-CARB'")
  r=$(rpc elena set_pass_lead_contacted "{\"p_lead_id\":\"$lead\",\"p_contacted\":true}")
  [ "$(q "select contacted_at is null from pass_leads where id='$lead'")" = t ] && ok "coach: refused, contacted_at still empty" || bad "coach contacted: $r"
  rpc bullbox set_pass_lead_contacted "{\"p_lead_id\":\"$lead\",\"p_contacted\":true}" > /dev/null
  got=$(rpc bullbox av_athletes_partner_summary "{\"p_partner_id\":\"$PA\"}" | python3 -c "import sys,json;print(next((g.get('contacted_at') or '') for g in json.load(sys.stdin)['guests'] if g['pass_code']=='AV-CARB'))")
  [ -n "$got" ] && ok "owner: contacted_at set and returned by the summary ($got)" || bad "owner contacted: summary has '$got'"
  # "No second writer" is a source property, asked as a capability with
  # comments stripped: lib/dal/leadContact.singleWriter.test.ts. (A grep here
  # matched the files' own prose explaining that they reuse the function.)
  NO_COLOR=1 npx vitest run lib/dal/leadContact.singleWriter.test.ts > "$TMP/sw.out" 2>&1 \
    && ok "one writer of contacted_at (leadContact.singleWriter.test.ts)" || bad "single-writer test: $(grep -m1 -E 'FAIL|Error' "$TMP/sw.out")"
  reset
fi

echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" = 0 ]
