#!/bin/bash
# T-AV29 acceptance proof (Al's phone scan, 2026-10-06), LOCAL stack only.
#
#   bash supabase/recon/t-av29-proof.LOCAL.sh            # every test
#   ONLY="1" bash supabase/recon/t-av29-proof.LOCAL.sh   # a subset (the mutation driver uses this)
#
#   1  the voucher QR encodes the app's PUBLIC origin, not request.url's. The
#      server runs with NEXT_PUBLIC_SITE_URL set to the Mac's LAN address and
#      the claim is made through localhost, so the two differ: the QR must be
#      the LAN address (what a phone can reach) and never localhost. The QR is
#      decoded by rebuilding it with the same qrcode-generator settings.
#   2  the scan and login return, in a real browser: e2e/av/scanLogin.spec.ts
#      through `npm run test:e2e:av` (a signed-out coach scans, signs in, and
#      is back on the exact pass URL, ?via=code kept; an off-site returnTo
#      lands on this site).
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
reset() {
  node scripts/av-seed-athletes.mjs < /dev/null > "$TMP/reset.out" 2>&1 || { echo "FATAL: seed reset failed"; cat "$TMP/reset.out"; exit 1; }
  q "delete from rate_limits where key like 'pase:%'; delete from notifications where type like 'av\_%';" > /dev/null
}
cleanup() { stop_server; reset; rm -rf "$TMP"; }
if port_busy; then echo "REFUSED: something is already listening on $AV_PROOF_PORT; stop it first"; exit 2; fi
trap cleanup EXIT
reset

pass=0; fail=0
ok()  { printf "  PASS  %s\n" "$1"; pass=$((pass+1)); }
bad() { printf "  FAIL  %s\n" "$1"; fail=$((fail+1)); }

if want 1; then
  LAN=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 192.168.1.2)
  SITE="http://$LAN:$AV_PROOF_PORT"
  AV_SITE_URL="$SITE" start_server all; echo "dev:av up, flag=all, NEXT_PUBLIC_SITE_URL=$SITE"; echo
  echo "== 1. the voucher QR encodes the public origin, not request.url's"
  body=$(python3 -c "
import json,time
print(json.dumps({'slug':'bullbox-prueba','name':'Origen Prueba','whatsapp':'+573005557821','email':'origen.t29@guest.local',
  'src':'atleta','code':'ANA-7KQ','consent':True,'website':'','t':int(time.time()*1000)-5000}))")
  c=$(curl -s -o "$TMP/claim.json" -w '%{http_code}' -X POST "$APP/api/pase/" -H 'content-type: application/json' -H 'x-forwarded-for: 10.29.0.1' -d "$body")
  cat > "$TMP/qr.mjs" <<'JS'
import qrcode from 'qrcode-generator';
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const got = (r.qr_svg ?? '').match(/<path d="([^"]*)"/)?.[1] ?? '';
const pathOf = (data) => { const q = qrcode(0, 'M'); q.addData(data); q.make(); let p = ''; const n = q.getModuleCount();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) p += `M${x + 4} ${y + 4}h1v1h-1z`; return p; };
const found = process.argv.slice(3).find((o) => got && pathOf(`${o}/pase/verificar/${r.pass_code}/`) === got);
console.log(found ?? 'NONE');
JS
  cp "$TMP/qr.mjs" "$ROOT/.t-av29-qr.tmp.mjs"
  enc=$(node "$ROOT/.t-av29-qr.tmp.mjs" "$TMP/claim.json" "$SITE" "$APP" "http://127.0.0.1:$AV_PROOF_PORT"); rm -f "$ROOT/.t-av29-qr.tmp.mjs"
  [ "$c" = 200 ] && [ "$enc" = "$SITE" ] && ok "claimed through $APP, the QR encodes $SITE/pase/verificar/{code}/" \
    || bad "QR origin: http $c, encodes '$enc' (want $SITE)"
  stop_server
fi

if want 2; then echo "== 2. the scan and login return, in a real browser"
  AV_E2E_ONLY=flag-on AV_E2E_GREP='scans the voucher QR' npm run test:e2e:av > "$TMP/e2e.out" 2>&1; rc=$?
  passed=$(grep -oE '[0-9]+ passed' "$TMP/e2e.out" | awk '{s+=$1} END {print s+0}')
  [ "$rc" = 0 ] && [ "$passed" = 1 ] && ok "scanLogin.spec.ts: QR decoded, login returns to the exact pass URL, ?via=code kept, off-site returnTo refused" \
    || bad "scanLogin: rc $rc, $passed passed; $(grep -m1 -E '›.*›.*›|Error:' "$TMP/e2e.out" | cut -c1-140)"
  cp "$TMP/e2e.out" "${AV_E2E_LOG:-/dev/null}" 2>/dev/null || true
fi

echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" = 0 ]
