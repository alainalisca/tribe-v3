#!/bin/bash
# T-AV23 mutation proofs (acceptance 10), end to end against the LOCAL stack.
#
#   bash supabase/recon/t-av23-mutations.LOCAL.sh
#
#   M1  the partner match removed from findActiveAthleteByRefCode -> test 4 must go RED
#   M2  WhatsApp normalization removed from /api/pase            -> test 6 must go RED
#
# These are app-code mutations, so each arm edits a source file, runs the
# named test through t-av23-proof.LOCAL.sh (which starts its own dev:av, so
# the edited code is what gets compiled), restores the file, and runs the
# test again. The edit and the restore are each ASSERTED to have landed, byte
# for byte: a mutation that silently did not apply would report the guard as
# working (CLAUDE.md). A trap restores every file on any exit.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$NEXT_PUBLIC_SUPABASE_URL" || { echo "REFUSED: API is not local"; exit 2; }

TMP=$(mktemp -d)
FILES="lib/dal/athleteReferral.ts app/api/pase/route.ts"
for f in $FILES; do cp "$f" "$TMP/$(basename "$f").orig"; done
restore_all() { for f in $FILES; do cp "$TMP/$(basename "$f").orig" "$f"; done; }
trap 'restore_all; rm -rf "$TMP"' EXIT

# mutate <file> <old> <new>: exactly one occurrence, and the file must change
mutate() {
  python3 - "$1" "$2" "$3" <<'PY' || return 1
import sys
p, old, new = sys.argv[1:]
s = open(p).read()
n = s.count(old)
if n != 1:
    print(f"  FATAL: the text to replace occurs {n} times, expected 1: {old}"); sys.exit(1)
open(p, 'w').write(s.replace(old, new, 1))
PY
  cmp -s "$1" "$TMP/$(basename "$1").orig" && { echo "  FATAL: mutation did not land"; return 1; }
  echo "  mutation landed ($1 differs from the original)"
}
restore() {
  cp "$TMP/$(basename "$1").orig" "$1"
  cmp -s "$1" "$TMP/$(basename "$1").orig" && echo "  restore landed ($1 equals the original)" || { echo "  FATAL: restore did not land"; return 1; }
}
verdict() { # verdict <test> <RED|GREEN>
  ONLY="$1" bash supabase/recon/t-av23-proof.LOCAL.sh > "$TMP/out" 2>&1; rc=$?
  fails=$(grep -c '  FAIL ' "$TMP/out"); passes=$(grep -c '  PASS ' "$TMP/out")
  if [ "$2" = RED ]; then [ "$rc" != 0 ] && [ "$fails" -gt 0 ] && got=RED || got=GREEN
  else [ "$rc" = 0 ] && [ "$fails" = 0 ] && [ "$passes" -gt 0 ] && got=GREEN || got=RED; fi
  first=""; [ "$2" = RED ] && first="  first failure: $(grep -m1 '  FAIL ' "$TMP/out" | sed 's/^ *FAIL *//' | cut -c1-110)"
  [ "$2" = GREEN ] && [ "$got" = RED ] && first="  first failure: $(grep -m1 -E '  FAIL |FATAL|REFUSED' "$TMP/out" | cut -c1-110)"
  printf "  %-5s test %s: %s (%s pass, %s fail)%s\n" "$([ "$got" = "$2" ] && echo OK || echo WRONG)" "$1" "$got" "$passes" "$fails" "$first"
  [ "$got" = "$2" ]
}
all_ok=0

echo "== M1. partner match removed from findActiveAthleteByRefCode (test 4 must go RED)"
mutate lib/dal/athleteReferral.ts "    .eq('partner_id', partnerId)
    .eq('status', 'active')" "    .eq('status', 'active')" || exit 1
verdict 4 RED || all_ok=1
restore lib/dal/athleteReferral.ts || exit 1
verdict 4 GREEN || all_ok=1

echo "== M2. WhatsApp normalization removed from /api/pase (test 6 must go RED)"
mutate app/api/pase/route.ts "const whatsapp = normalizeWhatsApp(typeof raw.whatsapp === 'string' ? raw.whatsapp : '');" \
  "const whatsapp = typeof raw.whatsapp === 'string' ? raw.whatsapp.trim() : ''; void normalizeWhatsApp;" || exit 1
verdict 6 RED || all_ok=1
restore app/api/pase/route.ts || exit 1
verdict 6 GREEN || all_ok=1

echo
[ "$all_ok" = 0 ] && echo "BOTH MUTATIONS CAUGHT; both restores landed; both tests green again" || echo "SOME ARM DID NOT BEHAVE AS EXPECTED"
exit "$all_ok"
