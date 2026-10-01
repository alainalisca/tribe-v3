#!/bin/bash
# T-AV23 acceptance proof: /api/pase and /pase/[slug] end to end, against the
# LOCAL stack (8200 to 8207 applied, `npm run av:seed`), through `dev:av` on
# the proof port (devServer.LOCAL.sh, 3101), started by this script with the flag OFF and then ON.
#
#   bash supabase/recon/t-av23-proof.LOCAL.sh             # every test
#   ONLY="4 6" bash supabase/recon/t-av23-proof.LOCAL.sh   # a subset (the mutation driver uses this)
#
# Why end to end and not only unit tests: a mocked query builder answers any
# filter the same way, so "a code only resolves at its own gym" can only be
# proven against the database (CLAUDE.md, the mock that answered any select).
#
# Each POST carries its own x-forwarded-for, so the route's per-IP rate limit
# (5 per 10 minutes) never interferes. Rows and ledger verdicts are read back
# with psql, never inferred from the HTTP body.
#
# LOCAL ONLY. Refuses unless the API and Postgres are on this machine, and
# refuses to start if something it did not start is already on the proof port.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
PGURL="${AV_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
# APP and the proof port come from supabase/recon/devServer.LOCAL.sh.
is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$NEXT_PUBLIC_SUPABASE_URL" || { echo "REFUSED: API is not local"; exit 2; }
is_local "$PGURL" || { echo "REFUSED: Postgres is not local"; exit 2; }

q() { psql -X -v ON_ERROR_STOP=1 -At -d "$PGURL" -c "$1" < /dev/null; }
want() { [ -z "${ONLY:-}" ] || [[ " $ONLY " == *" $1 "* ]]; }
TMP=$(mktemp -d)
ID() { printf '00000000-0000-4000-8000-%012d' "$1"; }
ANA_PA=$(ID 2001); BETO_PA=$(ID 2002); CARO_PA=$(ID 2003)

# ── the dev server, owned by this script (shared helper) ────────────────
. "$ROOT/supabase/recon/devServer.LOCAL.sh"
reset() { node scripts/av-seed-athletes.mjs < /dev/null > "$TMP/reset.out" 2>&1 || { echo "FATAL: seed reset failed"; cat "$TMP/reset.out"; exit 1; }; }
PB=$(q "select id from featured_partners where user_id='$(ID 9)'")
cleanup() {
  stop_server
  q "delete from partner_lead_routing where partner_id='$PB'; delete from rate_limits where key like 'pase:10.23.%';" > /dev/null
  reset
  rm -rf "$TMP"
}

if port_busy; then echo "REFUSED: something is already listening on $AV_PROOF_PORT; stop it first (this script starts its own dev:av)"; exit 2; fi
trap cleanup EXIT
reset
PA=$(q "select id from featured_partners where user_id='$(ID 7)'")
SLUG_A=$(q "select slug from featured_partners where id='$PA'")
SLUG_B=$(q "select slug from featured_partners where id='$PB'")
[ -n "$PA" ] && [ -n "$PB" ] && [ "$SLUG_A" = bullbox-prueba ] || { echo "FATAL: seed partners missing; run npm run av:seed"; exit 1; }
[ "$(q "select count(*) from program_athletes where id in ('$ANA_PA','$BETO_PA','$CARO_PA') and status='active'")" = 3 ] || { echo "FATAL: seed athletes missing"; exit 1; }
[ "$(q "select count(*) from pass_leads where partner_id='$PA' and email='maria.vuelve@guest.local' and attended_at is not null")" -ge 1 ] || { echo "FATAL: the attended P0 lead (for the returning guest) is missing"; exit 1; }

pass=0; fail=0
ok()  { printf "  PASS  %s\n" "$1"; pass=$((pass+1)); }
bad() { printf "  FAIL  %s\n" "$1"; fail=$((fail+1)); }
# One x-forwarded-for per request. The counter lives in a FILE: post runs
# inside $(...), a subshell, so a shell variable incremented there is lost and
# every request would share one rate-limit bucket (that happened: 429 on the
# sixth POST).
echo 0 > "$TMP/ip"
post() { # post <slug> <src|-> <code|-> <email> <whatsapp> -> http code; body in $TMP/r.json
  local ip body
  ip=$(( $(cat "$TMP/ip") + 1 )); echo "$ip" > "$TMP/ip"

  body=$(python3 -c "
import json,sys,time
s,src,code,email,wa=sys.argv[1:]
print(json.dumps({'slug':s,'name':'Laura Prueba Invitada','whatsapp':wa,'email':email,'src':None if src=='-' else src,
  'code':None if code=='-' else code,'consent':True,'website':'','t':int(time.time()*1000)-5000}))" "$1" "$2" "$3" "$4" "$5")
  curl -s -o "$TMP/r.json" -w '%{http_code}' -X POST "$APP/api/pase/" -H 'content-type: application/json' \
    -H "x-forwarded-for: 10.23.$((ip / 250)).$((ip % 250 + 1))" -d "$body"
}
field() { python3 -c "import json,sys; d=json.load(open('$TMP/r.json')); v=d.get(sys.argv[1]); print('' if v is None else v)" "$1"; }
keys() { python3 -c "import json; print(','.join(sorted(json.load(open('$TMP/r.json')).keys())))"; }
row() { q "select coalesce(referred_by_athlete_id::text,'NULL')||'|'||coalesce(code,'NULL')||'|'||whatsapp from pass_leads where pass_code='$1'"; }
consent_of() { q "select consent_text from pass_leads where pass_code='$1'"; }
verdict() { q "select coalesce(l.no_credit_reason,'credited') from av_athletes_ledger('$PA') l join pass_leads p on p.id = l.lead_id where p.pass_code='$1'"; }
qr_ok() { python3 -c "
import json,re,sys
svg=json.load(open('$TMP/r.json')).get('qr_svg') or ''
shape=re.compile(r'^<svg xmlns=\"http://www\.w3\.org/2000/svg\" viewBox=\"0 0 \d+ \d+\" role=\"img\" aria-label=\"[^\"<>]*\" shape-rendering=\"crispEdges\"><rect width=\"\d+\" height=\"\d+\" fill=\"#ffffff\"/><path d=\"[Mhvz0-9 -]*\" fill=\"#000000\"/></svg>$')
sys.exit(0 if shape.match(svg) and ('pase '+sys.argv[1]) in svg else 1)" "$1"; }
V1_A='Autorizo a Tribe a compartir mi nombre, WhatsApp y correo con BullBox (Prueba) para que me contacte sobre mi clase gratis.'
ATTR_ANA="$V1_A Mi primer nombre, si asistí a mi clase y si me inscribí se compartirán con Ana, quien me invitó. BullBox (Prueba) y Tribe registrarán si asistí."

# ════ flag OFF ═══════════════════════════════════════════════════════════════
if want 1 || want 2; then
  start_server off
  echo "dev:av up, flag=off"; echo
fi

if want 1; then echo "== 1. flag off: body, row and emails as before, with and without an athlete link"
  for link in plain athlete; do
    if [ $link = plain ]; then c=$(post "$SLUG_A" - - "off.plain@guest.local" "+573005551101"); else c=$(post "$SLUG_A" atleta ANA-7KQ "off.link@guest.local" "+573005551102"); fi
    pc=$(field pass_code); r=$(row "$pc")
    [ "$c" = 200 ] && [ "$(keys)" = "pass_code,storefront_url,whatsapp_url" ] && [ "${r%%|*}" = NULL ] && [ "$(consent_of "$pc")" = "$V1_A" ] \
      && ok "$link: 200, exactly the three keys, no referred_by_athlete_id, V1 consent (row $r)" || bad "$link: http $c keys=$(keys) row=$r"
  done
  [ "$(row "$(field pass_code)" | cut -d'|' -f2)" = ANA-7KQ ] && ok "athlete link, flag off: the code is stored as plain code, as before" || bad "code not stored as plain text"
  sleep 1
  n=$(grep -c '\[email:log\]' "$TMP/dev.log"); tpl=$(grep -o 'template=[a-z_-]*' "$TMP/dev.log" | sort -u | tr '\n' ' ')
  [ "$n" = 4 ] && ok "emails: 4 in log mode, partner and guest for each lead, link or not (templates: $tpl)" || bad "email log lines: $n ($tpl)"
fi

if want 2; then echo "== 2. flag off: the pass page with an athlete link shows no chip and the V1 consent"
  html=$(curl -s "$APP/pase/$SLUG_A/?src=atleta&code=ANA-7KQ")
  [[ "$html" != *"Te invita"* && "$html" != *"primer nombre"* && "$html" == *"para que me contacte sobre mi clase gratis."* ]] \
    && ok "no chip, no extra consent lines, V1 present" || bad "flag-off page shows attribution"
fi

# ════ flag ON ════════════════════════════════════════════════════════════════
if want 3 || want 4 || want 5 || want 6 || want 7; then
  start_server all
  echo; echo "dev:av up, flag=all"; echo
fi

if want 3; then echo "== 3. flag on, a valid code at the home gym"
  c=$(post "$SLUG_A" atleta ANA-7KQ "laura.on@guest.local" "+573005551103"); pc=$(field pass_code)
  [ "$c" = 200 ] && [ "$(row "$pc" | cut -d'|' -f1)" = "$ANA_PA" ] && ok "referred_by_athlete_id = Ana's program athlete" || bad "attribution: http $c row=$(row "$pc")"
  [ "$(consent_of "$pc")" = "$ATTR_ANA" ] && ok "consent_text is V1 plus both lines ($(consent_of "$pc" | python3 -c 'import sys; print(len(sys.stdin.read().rstrip(chr(10))))') characters)" || bad "consent: $(consent_of "$pc")"
  qr_ok "$pc" && ok "qr_svg present, exactly the renderer's shape, labelled with pass $pc" || bad "qr_svg missing or malformed"
  html=$(curl -s "$APP/pase/$SLUG_A/?src=atleta&code=ANA-7KQ")
  [[ "$html" == *"Te invita"*"Ana"* && "$html" == *"Mi primer nombre, si asistí a mi clase y si me inscribí se compartirán con Ana, quien me invitó."* ]] \
    && ok "page: \"Te invita Ana\" chip and the athlete consent line" || bad "page chip or consent line missing"
  html=$(curl -s "$APP/pase/$SLUG_A/")
  [[ "$html" != *"Te invita"* ]] && ok "page without a link: no chip" || bad "chip shown without a link"
fi

if want 4; then echo "== 4. flag on, Ana's code on ANOTHER partner's slug (that partner's program active)"
  q "insert into partner_lead_routing (partner_id, lead_email) values ('$PB','otro@av.local') on conflict (partner_id) do nothing; update athlete_programs set is_active = true where partner_id='$PB';" > /dev/null
  [ "$(q "select is_active from athlete_programs where partner_id='$PB'")" = t ] || { echo "FATAL: partner B program not active"; exit 1; }
  c=$(post "$SLUG_B" atleta ANA-7KQ "laura.b@guest.local" "+573005551104"); pc=$(field pass_code); r=$(row "$pc")
  [ "$c" = 200 ] && [ "${r%%|*}" = NULL ] && [ "$(echo "$r" | cut -d'|' -f2)" = ANA-7KQ ] \
    && ok "no attribution; code stored as plain text (row $r)" || bad "cross-partner code: http $c row=$r"
  qr_ok "$pc" && ok "partner B's program is on, so its voucher QR shows (the refusal is about the partner, not the flag)" || bad "partner B qr missing"
  q "update athlete_programs set is_active = false where partner_id='$PB'; delete from partner_lead_routing where partner_id='$PB';" > /dev/null
fi

if want 5; then echo "== 5. flag on, a paused and an ended athlete's code"
  for st in paused ended; do
    q "update program_athletes set status='$st' where id='$BETO_PA';" > /dev/null
    c=$(post "$SLUG_A" atleta BETO-M3X "beto.$st@guest.local" "+57300555120$([ $st = paused ] && echo 1 || echo 2)"); pc=$(field pass_code); r=$(row "$pc")
    [ "$c" = 200 ] && [ "${r%%|*}" = NULL ] && ok "$st: no attribution (row $r)" || bad "$st: http $c row=$r"
  done
  q "update program_athletes set status='active' where id='$BETO_PA';" > /dev/null
fi

if want 6; then echo "== 6. flag on, self-referral: ATTRIBUTED, and the ledger refuses credit"
  c=$(post "$SLUG_A" atleta CARO-P9R "caro@av.local" "+573005551301"); pc=$(field pass_code)
  [ "$c" = 200 ] && [ "$(row "$pc" | cut -d'|' -f1)" = "$CARO_PA" ] && [ "$(verdict "$pc")" = self_email ] \
    && ok "by email: attributed to Caro, ledger says self_email" || bad "self email: http $c row=$(row "$pc") ledger=$(verdict "$pc")"
  c=$(post "$SLUG_A" atleta CARO-P9R "self.wa@guest.local" "300 111 0003"); pc=$(field pass_code); r=$(row "$pc")
  [ "$c" = 200 ] && [ "${r%%|*}" = "$CARO_PA" ] && [ "${r##*|}" = "+573001110003" ] && [ "$(verdict "$pc")" = self_whatsapp ] \
    && ok "by WhatsApp typed \"300 111 0003\": stored +573001110003, attributed, ledger says self_whatsapp" || bad "self whatsapp: http $c row=$r ledger=$(verdict "$pc")"
fi

if want 7; then echo "== 7. flag on, a returning guest (earlier attended lead, same email)"
  c=$(post "$SLUG_A" atleta CARO-P9R "maria.vuelve@guest.local" "+573005551401"); pc=$(field pass_code)
  [ "$c" = 200 ] && [ "$(row "$pc" | cut -d'|' -f1)" = "$CARO_PA" ] && [ "$(verdict "$pc")" = returning ] \
    && ok "row created and attributed; ledger says returning, no credit" || bad "returning: http $c row=$(row "$pc") ledger=$(verdict "$pc")"
fi

echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" = 0 ]
