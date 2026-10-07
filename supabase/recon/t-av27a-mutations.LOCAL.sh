#!/bin/bash
# T-AV27a mutation proofs.
#
#   bash supabase/recon/t-av27a-mutations.LOCAL.sh
#
#   A1  guard: the {name} strip removed               -> i18nGuards "drops {name}..." RED, and the corpus arm RED on {max}
#   A2  guard: the list check reads the raw string     -> i18nGuards "a real unaccented word beside a placeholder..." RED
#   A3  consent: T-AV23's wording put back             -> t-av27a-proof test 1 RED (live) and consent.test RED
#   A4  Invitados opens on 'all'                       -> GymGuests "opens on Abiertos" RED
#   A5  no 20-row page                                 -> GymGuests "20 rows, then Ver más" RED
#   A6  outcomes rendered without the open check       -> GymGuests "outcomes stay behind Registrar resultado" RED
#   A7  "Abiertos" admits closed guests                -> gymView "Abiertos: came with no outcome first" RED
#
# Every arm asserts its edit landed and its restore landed, byte for byte.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
TMP=$(mktemp -d)
GUARD="lib/i18n/i18nGuards.test.ts"; CONSENT="lib/pase/consent.ts"
GUESTS="app/atletas/gym/[partnerId]/GymGuests.tsx"; VIEW="lib/atletas/gymView.ts"
for f in "$GUARD" "$CONSENT" "$GUESTS" "$VIEW"; do cp "$f" "$TMP/$(echo "$f" | tr '/[]' '___')"; done
orig_of() { echo "$TMP/$(echo "$1" | tr '/[]' '___')"; }
restore_all() { for f in "$GUARD" "$CONSENT" "$GUESTS" "$VIEW"; do cp "$(orig_of "$f")" "$f"; done; }
trap 'restore_all; rm -rf "$TMP"' EXIT

replace_once() { # replace_once <file> <old> <new>
  python3 - "$1" "$2" "$3" <<'PY' || return 1
import sys
p, old, new = sys.argv[1:]
s = open(p).read()
n = s.count(old)
if n != 1:
    print(f"  FATAL: the text to replace occurs {n} times in {p}, expected 1"); sys.exit(1)
open(p, 'w').write(s.replace(old, new, 1))
PY
}
landed() { cmp -s "$1" "$(orig_of "$1")" && { echo "  FATAL: $2 did not land"; exit 1; }; echo "  mutation landed ($1 differs)"; }
restore() { cp "$(orig_of "$1")" "$1"; cmp -s "$1" "$(orig_of "$1")" && echo "  restore landed ($1 equals the original)" || { echo "  FATAL: $2 restore did not land"; exit 1; }; }
all_ok=0
# unit <test file> <RED|GREEN> <name fragment>: the named test's state
unit() {
  NO_COLOR=1 npx vitest run "$1" --reporter=verbose > "$TMP/u.out" 2>&1; rc=$?
  if [ "$2" = RED ]; then
    hit=$(grep -E '^\s*×' "$TMP/u.out" | grep -F "$3" | head -1)
    [ "$rc" != 0 ] && [ -n "$hit" ] && echo "  OK    $1: \"$3\" RED" || { echo "  WRONG $1: \"$3\" not red"; all_ok=1; }
  else
    [ "$rc" = 0 ] && echo "  OK    $1: GREEN" || { echo "  WRONG $1: not green after restore"; all_ok=1; }
  fi
}
live() { # live <test> <RED|GREEN>
  ONLY="$1" bash supabase/recon/t-av27a-proof.LOCAL.sh > "$TMP/l.out" 2>&1; rc=$?
  fails=$(grep -c '  FAIL ' "$TMP/l.out")
  if [ "$2" = RED ]; then [ "$rc" != 0 ] && [ "$fails" -gt 0 ] && echo "  OK    proof test $1: RED  first failure: $(grep -m1 '  FAIL ' "$TMP/l.out" | cut -c9-100)" || { echo "  WRONG proof test $1 not red"; all_ok=1; }
  else [ "$rc" = 0 ] && [ "$fails" = 0 ] && echo "  OK    proof test $1: GREEN" || { echo "  WRONG proof test $1 not green: $(grep -m1 -E 'FAIL|FATAL|REFUSED' "$TMP/l.out")"; all_ok=1; }; fi
}

echo "== A1. the {name} strip removed"
replace_once "$GUARD" "    .replace(/\\{[A-Za-z_][A-Za-z0-9_]*\\}/g, ' ')" "" || exit 1
landed "$GUARD" A1
unit "$GUARD" RED "drops {name}, {{name}} and \${name} slots"
unit "$GUARD" RED "no Spanish string is missing an accent"
restore "$GUARD" A1; unit "$GUARD" GREEN

echo "== A2. the list check reads the raw string"
replace_once "$GUARD" "  const text = withoutPlaceholders(value);" "  const text = value;" || exit 1
landed "$GUARD" A2
unit "$GUARD" RED "a real unaccented word beside a placeholder"
restore "$GUARD" A2; unit "$GUARD" GREEN

echo "== A3. T-AV23's consent wording put back"
replace_once "$CONSENT" "'Mi primer nombre, si asistí a mi clase y si me inscribí se compartirán con {firstName}, quien me invitó. {gym} y Tribe registrarán si asistí.'" \
  "'Mi primer nombre y si asistí se compartirán con {firstName}, quien me invitó. {gym} y Tribe registrarán si asistí a mi clase.'" || exit 1
landed "$CONSENT" A3
unit lib/pase/consent.test.ts RED "BullBox (Prueba), invited by Ana"
live 1 RED
restore "$CONSENT" A3; unit lib/pase/consent.test.ts GREEN; live 1 GREEN

GT="app/atletas/gym/[partnerId]/GymGuests.test.tsx"
echo "== A4. Invitados opens on 'all'"
replace_once "$GUESTS" "useState<GuestFilter>(DEFAULT_GUEST_FILTER)" "useState<GuestFilter>('all')" || exit 1
landed "$GUESTS" A4; unit "$GT" RED "opens on Abiertos"; restore "$GUESTS" A4

echo "== A5. no 20-row page"
replace_once "$GUESTS" "const visible = rows.slice(0, shown);" "const visible = rows; void shown;" || exit 1
landed "$GUESTS" A5; unit "$GT" RED "20 rows, then Ver más"; restore "$GUESTS" A5

echo "== A6. outcomes rendered without the open check"
replace_once "$GUESTS" "{g.attendedAt && outcomesOpen ? (" "{g.attendedAt ? (" || exit 1
landed "$GUESTS" A6; unit "$GT" RED "outcomes stay behind Registrar resultado"; restore "$GUESTS" A6
unit "$GT" GREEN

echo "== A7. Abiertos admits closed guests"
replace_once "$VIEW" "    case 'open':
      return g.outcome === null;" "    case 'open':
      return true;" || exit 1
landed "$VIEW" A7; unit lib/atletas/gymView.guests.test.ts RED "Abiertos\": came with no outcome first"; restore "$VIEW" A7
unit lib/atletas/gymView.guests.test.ts GREEN

echo
[ "$all_ok" = 0 ] && echo "ALL ARMS BEHAVED; every edit and restore landed" || echo "SOME ARM DID NOT BEHAVE AS EXPECTED"
exit "$all_ok"
