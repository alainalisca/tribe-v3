#!/bin/bash
# T-AV24 acceptance proof: /atletas/ and /api/atletas/home-card end to end,
# signed in as each seed account, against the LOCAL stack (8200 to 8207,
# `npm run av:seed`), through a dev:av this script starts (flag off, then on).
#
#   bash supabase/recon/t-av24-proof.LOCAL.sh            # every test
#   ONLY="3 5" bash supabase/recon/t-av24-proof.LOCAL.sh  # a subset (the mutation driver uses this)
#
# Sessions come from scripts/avSessionCookie.mjs (the app's own @supabase/ssr,
# seed password). The server renders the default language and the client
# switches after mount, so numbers are read from data-* attributes.
#
# THE LEAK CHECK reads two things per athlete: the HTML, and the RSC payload
# (the same URL with `RSC: 1`), which is what the browser's network tab shows
# for a client navigation. Each must contain the athlete's own data (so an
# empty or error page cannot pass) and none of the other athletes'.
#
# LOCAL ONLY, and refuses to start if something it did not start is on the proof port.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
PGURL="${AV_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
# APP and the proof port come from supabase/recon/devServer.LOCAL.sh (3101).
is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$NEXT_PUBLIC_SUPABASE_URL" || { echo "REFUSED: API is not local"; exit 2; }
is_local "$PGURL" || { echo "REFUSED: Postgres is not local"; exit 2; }

q() { psql -X -v ON_ERROR_STOP=1 -At -d "$PGURL" -c "$1" < /dev/null; }
want() { [ -z "${ONLY:-}" ] || [[ " $ONLY " == *" $1 "* ]]; }
TMP=$(mktemp -d)
. "$ROOT/supabase/recon/devServer.LOCAL.sh"
reset() { node scripts/av-seed-athletes.mjs < /dev/null > "$TMP/reset.out" 2>&1 || { echo "FATAL: seed reset failed"; cat "$TMP/reset.out"; exit 1; }; }
cleanup() { stop_server; q "delete from rate_limits where key like 'pase:10.24.%';" > /dev/null; reset; rm -rf "$TMP"; }

if port_busy; then echo "REFUSED: something is already listening on $AV_PROOF_PORT; stop it first"; exit 2; fi
trap cleanup EXIT
reset
BETO_PA=00000000-0000-4000-8000-000000002002
[ "$(q "select count(*) from program_athletes where status='active'")" = 3 ] || { echo "FATAL: seed athletes missing"; exit 1; }

for who in ana beto caro diego; do
  c=$(node scripts/avSessionCookie.mjs "$who@av.local") || { echo "FATAL: no session for $who"; exit 1; }
  eval "C_$who=\$c"
done
cookie() { local v="C_$1"; echo "${!v}"; }
html() { curl -s -o "$TMP/$1.html" -w '%{http_code}' -H "Cookie: $(cookie "$1")" "$APP/atletas/"; }
rsc() { curl -s -o "$TMP/$1.rsc" -w '%{content_type}' -H "Cookie: $(cookie "$1")" -H 'RSC: 1' "$APP/atletas/"; }
card() { curl -s -o "$TMP/card.json" -w '%{http_code}' -H "Cookie: $(cookie "$1")" "$APP/api/atletas/home-card/"; }
attr() { python3 - "$TMP/$1.html" "$2" <<'PY'
import re, sys
s = open(sys.argv[1], encoding='utf-8').read()
m = re.search(sys.argv[2], s)
print(m.group(1) if m else '')
PY
}
metrics() { echo "$(attr "$1" 'data-metric="invited"[^>]*>(\d+)<')|$(attr "$1" 'data-metric="showedUp"[^>]*>(\d+)<')|$(attr "$1" 'data-metric="joined"[^>]*>(\d+)<')|$(attr "$1" 'data-metric="stayed"[^>]*>(\d+)<')"; }

status() { # status <path> [who] -> http code; body in $TMP/s.html
  if [ -n "${2:-}" ]; then curl -s -o "$TMP/s.html" -w '%{http_code}' -H "Cookie: $(cookie "$2")" "$APP$1"
  else curl -s -o "$TMP/s.html" -w '%{http_code}' "$APP$1"; fi
}
echo 0 > "$TMP/ip"
claim() { # claim <pass-code-suffix> -> http code; a plain, unattributed claim through /api/pase
  local ip; ip=$(( $(cat "$TMP/ip") + 1 )); echo "$ip" > "$TMP/ip"
  curl -s -o "$TMP/claim.json" -w '%{http_code}' -X POST "$APP/api/pase/" -H 'content-type: application/json' \
    -H "x-forwarded-for: 10.24.0.$ip" \
    -d "{\"slug\":\"bullbox-prueba\",\"name\":\"Gate Probe\",\"whatsapp\":\"+5730055524$1\",\"email\":\"gate.$1@guest.local\",\"consent\":true,\"website\":\"\",\"t\":$(( $(date +%s) * 1000 - 5000 ))}"
}

pass=0; fail=0
ok()  { printf "  PASS  %s\n" "$1"; pass=$((pass+1)); }
bad() { printf "  FAIL  %s\n" "$1"; fail=$((fail+1)); }

# ════ flag OFF ════
if want 1; then
  start_server off; echo "dev:av up, flag=off"; echo
  echo "== 1. flag off: each gated path answers exactly as an UNKNOWN path does for the same caller"
  # Baselines, measured 2026-09-30: signed in, an unknown URL is a real 404;
  # signed out, an unknown non-public URL redirects to /auth; under the public
  # /pase, an unknown path is a 404 either way.
  b_in=$(status /__no-such-route-tav24__/ ana); b_out=$(status /__no-such-route-tav24__/)
  b_pase_out=$(status /pase/no-such/deep/)
  [ "$b_in" = 404 ] && [ "$b_out" = 307 ] && [ "$b_pase_out" = 404 ] \
    && ok "baselines: unknown URL signed in http $b_in, signed out http $b_out; unknown /pase path signed out http $b_pase_out" \
    || bad "baselines: in=$b_in out=$b_out pase_out=$b_pase_out"
  for row in "/atletas/|ana|404" "/pase/verificar/AV-CARB/|ana|404" "/pase/verificar/AV-CARB/||404"; do
    IFS='|' read -r path who want_code <<< "$row"
    c=$(status "$path" "$who")
    [ "$c" = "$want_code" ] && grep -qE 'Page not found|Página no encontrada' "$TMP/s.html" && ! grep -qE 'data-athlete-state|data-metric|ANA-7KQ' "$TMP/s.html" \
      && ok "$path ${who:-signed out}: http $c, the ordinary not-found page, no athlete data" || bad "$path ${who:-signed out}: http $c (want $want_code)"
  done
  c=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$APP/atletas/")
  [[ "$c" == 307*"/auth?returnTo="* ]] && ok "/atletas/ signed out: the same redirect to /auth an unknown private URL gets (${c%% *})" || bad "/atletas/ signed out flag off: $c"
  [ "$(status /api/atletas/home-card/ ana)" = 404 ] && ok "/api/atletas/home-card/: http 404" || bad "flag-off card endpoint: $(status /api/atletas/home-card/ ana)"
  for who in "" ana; do
    c=$(status /pase/bullbox-prueba/ "$who")
    [ "$c" = 200 ] && grep -q 'Reclamar mi pase' "$TMP/s.html" && ok "public pass /pase/bullbox-prueba/ ${who:-signed out}: http $c with the form" || bad "public pass ${who:-signed out}: http $c"
  done
  c=$(claim 01)
  [ "$c" = 200 ] && [ "$(q "select count(*) from pass_leads where email='gate.01@guest.local'")" = 1 ] && ok "/api/pase claim: http $c, row saved" || bad "/api/pase claim flag off: http $c $(head -c 150 "$TMP/claim.json")"
fi

# ════ flag ON ════
if want 2 || want 3 || want 4 || want 5 || want 6; then start_server all; echo; echo "dev:av up, flag=all"; echo; fi

if want 2; then echo "== 2. each athlete sees the ledger's exact numbers"
  for row in "ana|9|9|0|0|captain|9/10|false" "beto|10|10|1|0|captain|10/10|true" "caro|7|6|3|1|athlete||"; do
    IFS='|' read -r who i s j r level prog ready <<< "$row"
    code=$(html "$who"); m=$(metrics "$who"); lv=$(attr "$who" 'data-level="([a-z]+)"')
    pr=$(attr "$who" 'data-progress="([0-9/]+)"'); rd=$(attr "$who" 'data-ready="(true|false)"')
    [ "$code" = 200 ] && [ "$m" = "$i|$s|$j|$r" ] && [ "$lv" = "$level" ] && [ "$pr" = "$prog" ] && [ "$rd" = "$ready" ] \
      && ok "$who: invited|showed|joined|stayed = $m, level $lv${prog:+, progress $pr, ready $rd}" \
      || bad "$who: http $code metrics=$m level=$lv progress=$pr ready=$rd"
  done
  bonus=$(grep -c 'data-bonus' "$TMP/caro.html"); nob=$(grep -c 'data-bonus' "$TMP/beto.html")
  [ "$bonus" -ge 1 ] && [ "$nob" = 0 ] && ok "bonus shown at athlete level (Caro), not to a captain (Beto)" || bad "bonus visibility caro=$bonus beto=$nob"
fi

if want 3; then echo "== 3. no athlete's page carries another athlete's data (HTML and RSC payload)"
  ANA_G="Andres Beatriz Camilo Daniela Esteban Fabiola Gustavo Helena Ivan"
  BETO_G="Julia Kevin Laura Mateo Nora Oscar Paula Quique Rosa Samuel"
  CARO_G="Lucia Marta Nico Olga Pedro Quina Raul Sara Tomas Maria"
  for who in ana beto caro; do
    html "$who" > /dev/null; ct=$(rsc "$who")
    case $who in
      ana) own_code=ANA-7KQ; own=$ANA_G; others="$BETO_G $CARO_G BETO-M3X CARO-P9R" ;;
      beto) own_code=BETO-M3X; own=$BETO_G; others="$ANA_G $CARO_G ANA-7KQ CARO-P9R" ;;
      caro) own_code=CARO-P9R; own=$CARO_G; others="$ANA_G $BETO_G ANA-7KQ BETO-M3X" ;;
    esac
    for kind in html rsc; do
      f="$TMP/$who.$kind"
      found=$(python3 - "$f" "$own_code" "$own" "$others" <<'PY'
import re, sys
s = open(sys.argv[1], encoding='utf-8', errors='replace').read()
own_code, own, others = sys.argv[2], sys.argv[3].split(), sys.argv[4].split()
missing = [w for w in [own_code] + own if not re.search(r'\b' + re.escape(w) + r'\b', s)]
leaked = [w for w in others if re.search(r'\b' + re.escape(w) + r'\b', s)]
banned = ['+57', '@guest.local', 'program_athlete_id', 'partner_id', 'email_lower', 'whatsapp_e164',
          '00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002002',
          '00000000-0000-4000-8000-000000002003', 'ccb8502a']
leaked += [b for b in banned if b in s]
print(f"missing={missing} leaked={leaked}")
PY
)
      [ "$found" = "missing=[] leaked=[]" ] && ok "$who $kind: own code and all own guests present, nothing of anyone else's" || bad "$who $kind: $found"
    done
    [[ "$ct" == *text/x-component* ]] && ok "$who: the RSC request really returned the RSC payload ($ct)" || bad "$who RSC content-type: $ct"
  done
fi

if want 4; then echo "== 4. Diego, not in a program; the Home card answers a boolean and nothing else"
  [ "$(html diego)" = 200 ] && [ "$(attr diego 'data-athlete-state="([a-z]+)"')" = none ] && ok "Diego: the not-in-program page" || bad "Diego page"
  for row in "ana|true" "diego|false"; do
    IFS='|' read -r who want_active <<< "$row"
    c=$(card "$who"); body=$(cat "$TMP/card.json")
    [ "$c" = 200 ] && [ "$body" = "{\"active\":$want_active}" ] && ok "home-card as $who: exactly $body" || bad "home-card $who: http $c body=$body"
  done
  feat=$(curl -s -H "Cookie: $(cookie diego)" "$APP/api/features/athlete-value/?feature=athletes")
  [[ "$feat" == *'"enabled":true'* ]] && ok "Profile card's endpoint says enabled for Diego (non-athletes can reach the page)" || bad "feature endpoint for diego: $feat"
fi

if want 5; then echo "== 5. a paused athlete: numbers stay, the link and QR are replaced, the Home card hides"
  q "update program_athletes set status='paused' where id='$BETO_PA';" > /dev/null
  html beto > /dev/null
  st=$(attr beto 'data-link-state="([a-z]+)"'); m=$(metrics beto)
  [ "$st" = inactive ] && ! grep -q 'data-athlete-link' "$TMP/beto.html" && ! grep -q 'data-link-qr' "$TMP/beto.html" && [ "$m" = "10|10|1|0" ] \
    && ok "Beto paused: link state inactive, no link, no QR, numbers $m" || bad "paused: state=$st metrics=$m"
  c=$(card beto); body=$(cat "$TMP/card.json")
  [ "$body" = '{"active":false}' ] && ok "home-card as paused Beto: exactly $body" || bad "paused card: http $c body=$body"
  q "update program_athletes set status='active' where id='$BETO_PA';" > /dev/null
fi

if want 6; then echo "== 6. flag on: the gated pages answer, and the public pass is unchanged"
  [ "$(status /atletas/ ana)" = 200 ] && ok "/atletas/ as Ana: http 200" || bad "/atletas/ flag on: $(status /atletas/ ana)"
  c=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$APP/atletas/")
  [[ "$c" == 307*"/auth?returnTo="* ]] && ok "/atletas/ signed out: the usual redirect to /auth (${c%% *})" || bad "/atletas/ signed out flag on: $c"
  [ "$(status /pase/verificar/AV-CARB/ ana)" = 200 ] && ok "/pase/verificar/{code}/ as Ana: http 200 (the page then refuses a non-coach)" || bad "verify flag on: $(status /pase/verificar/AV-CARB/ ana)"
  for who in "" ana; do
    c=$(status /pase/bullbox-prueba/ "$who")
    [ "$c" = 200 ] && grep -q 'Reclamar mi pase' "$TMP/s.html" && ok "public pass ${who:-signed out}: http $c with the form" || bad "public pass flag on ${who:-signed out}: http $c"
  done
  c=$(claim 02)
  [ "$c" = 200 ] && [ "$(q "select count(*) from pass_leads where email='gate.02@guest.local'")" = 1 ] && ok "/api/pase claim: http $c, row saved" || bad "/api/pase claim flag on: http $c"
fi

echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" = 0 ]
