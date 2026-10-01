#!/bin/bash
# T-AV27a acceptance proof, against the LOCAL stack (8200 to 8208, av:seed),
# through a dev:av on the proof port.
#
#   bash supabase/recon/t-av27a-proof.LOCAL.sh            # every test
#   ONLY="1" bash supabase/recon/t-av27a-proof.LOCAL.sh   # a subset (the mutation driver uses this)
#
#   1  a real attributed claim stores V1 plus the T-AV27a line, byte for byte,
#      and the pass page shows that line
#   2  no lead in the local database carries T-AV23's wording
#   3  the accent guard accepts "{max}" in gym.addCap, and the copy carries it
#
# The Invitados default view is a client-side ordering of the summary's rows;
# its proof is GymGuests.test.tsx and lib/atletas/gymView.test.ts, with the
# unit mutation arms. LOCAL ONLY.
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
reset() { node scripts/av-seed-athletes.mjs < /dev/null > "$TMP/reset.out" 2>&1 || { echo "FATAL: seed reset failed"; cat "$TMP/reset.out"; exit 1; }; }
cleanup() { stop_server; reset; rm -rf "$TMP"; }
if port_busy; then echo "REFUSED: something is already listening on $AV_PROOF_PORT; stop it first"; exit 2; fi
trap cleanup EXIT
reset
SLUG=$(q "select slug from featured_partners where user_id='00000000-0000-4000-8000-000000000007'")
[ -n "$SLUG" ] || { echo "FATAL: seed partner missing"; exit 1; }

V1='Autorizo a Tribe a compartir mi nombre, WhatsApp y correo con BullBox (Prueba) para que me contacte sobre mi clase gratis.'
LINE='Mi primer nombre, si asistí a mi clase y si me inscribí se compartirán con Ana, quien me invitó. BullBox (Prueba) y Tribe registrarán si asistí.'
OLD='Mi primer nombre y si asistí se compartirán con'

pass=0; fail=0
ok()  { printf "  PASS  %s\n" "$1"; pass=$((pass+1)); }
bad() { printf "  FAIL  %s\n" "$1"; fail=$((fail+1)); }

if want 1 || want 2; then start_server all; echo "dev:av up, flag=all"; echo; fi

if want 1; then echo "== 1. an attributed claim stores the T-AV27a consent, and the page shows it"
  body=$(python3 -c "
import json,time
print(json.dumps({'slug':'$SLUG','name':'Laura Consentimiento','whatsapp':'+573005557701','email':'laura.consent@guest.local',
  'src':'atleta','code':'ANA-7KQ','consent':True,'website':'','t':int(time.time()*1000)-5000}))")
  c=$(curl -s -o "$TMP/r.json" -w '%{http_code}' -X POST "$APP/api/pase/" -H 'content-type: application/json' -H 'x-forwarded-for: 10.27.0.1' -d "$body")
  code=$(python3 -c "import json;print(json.load(open('$TMP/r.json')).get('pass_code',''))")
  stored=$(q "select consent_text from pass_leads where pass_code='$code'")
  [ "$c" = 200 ] && [ "$stored" = "$V1 $LINE" ] && ok "stored consent_text is V1 plus the new line, byte for byte ($code)" \
    || bad "claim http $c, stored: $stored"
  html=$(curl -s "$APP/pase/$SLUG/?src=atleta&code=ANA-7KQ")
  [[ "$html" == *"$LINE"* && "$html" != *"$OLD"* ]] && ok "the pass page shows the new line and not the T-AV23 one" || bad "pass page consent"
fi

if want 2; then echo "== 2. no lead carries T-AV23's wording"
  n=$(q "select count(*) from pass_leads where consent_text like '%$OLD%'")
  total=$(q "select count(*) from pass_leads")
  [ "$n" = 0 ] && [ "$total" -gt 0 ] && ok "0 of $total local leads have the old wording" || bad "$n of $total leads have the old wording"
fi

if want 3; then echo "== 3. the accent guard accepts {max}, and the copy carries it"
  es=$(python3 -c "import json;print(json.load(open('messages/es.json'))['gym']['addCap'])")
  [[ "$es" == *"{max}"* ]] && ok "gym.addCap carries {max}: $es" || bad "gym.addCap: $es"
  NO_COLOR=1 npx vitest run lib/i18n/i18nGuards.test.ts > "$TMP/g.out" 2>&1 \
    && ok "i18nGuards green with {max} in the corpus" || bad "i18nGuards: $(grep -m1 -E 'should be|FAIL' "$TMP/g.out")"
fi

echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" = 0 ]
