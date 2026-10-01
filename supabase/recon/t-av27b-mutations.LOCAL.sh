#!/bin/bash
# T-AV27b mutation proofs, against the LOCAL stack.
#
#   bash supabase/recon/t-av27b-mutations.LOCAL.sh
#
# 8209, each refusal it owns (live proof):
#   N1  the push cap always says yes                 -> proof test 5 RED
#   N2  the once-per-lead-and-event index dropped     -> proof test 2 RED
#   N3  the credited check removed                    -> proof test 3 RED (a self-referral notifies)
#   N4  the event-happened check removed              -> proof test 3 RED (joined before any join)
#   N5  the door check removed                        -> proof test 4 RED (another gym's coach notifies)
#
# THE ADMIN SWITCH HAS TWO LAYERS (Al, 2026-10-01), so three arms, as T-AV26:
#   A1  the route's admin check removed (source)      -> proof test 9 stays GREEN (the guard trigger refuses)
#   A2  the is_active guard trigger disabled (db)     -> proof test 9 stays GREEN (the route refuses)
#   A3  both                                          -> proof test 9 RED (the owner switches their own program)
#
#   G1  middleware: /admin/atletas not admin-gated    -> proof test 8 RED (the owner reaches it)
#
# Unit arms (the "Mutation proofs" named in each test file's header): U1..U9.
#
# Every arm asserts its edit landed and its restore landed: a database object
# by the md5 of its definition (or the catalog row), a file byte for byte.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
set -a; . ./.env.av.local; set +a
PGURL="${AV_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
is_local() { python3 -c "import sys,urllib.parse as u; h=u.urlparse(sys.argv[1]).hostname or ''; sys.exit(0 if h in ('localhost','127.0.0.1','::1') else 1)" "$1"; }
is_local "$NEXT_PUBLIC_SUPABASE_URL" || { echo "REFUSED: API is not local"; exit 2; }
is_local "$PGURL" || { echo "REFUSED: Postgres is not local"; exit 2; }
q() { psql -X -v ON_ERROR_STOP=1 -At -d "$PGURL" -c "$1" < /dev/null; }
apply() { psql -X -v ON_ERROR_STOP=1 -q -d "$PGURL" -f "$1" < /dev/null > /dev/null; }
reload() { q "NOTIFY pgrst, 'reload schema';" > /dev/null; sleep 1; }
TMP=$(mktemp -d)

# ── captures ───────────────────────────────────────────────────────────────
CLAIM="public.av_athletes_claim_notification(text,text)"; CAP="public.av_push_allowed(uuid)"
fn_capture() { { q "select pg_get_functiondef('$1'::regprocedure)"; echo ';'; } > "$2"; }
md5fn() { q "select md5(pg_get_functiondef('$1'::regprocedure))"; }
fn_capture "$CLAIM" "$TMP/claim.orig.sql"; CLAIM_ORIG=$(md5fn "$CLAIM")
fn_capture "$CAP" "$TMP/cap.orig.sql"; CAP_ORIG=$(md5fn "$CAP")
INDEX_DEF=$(q "select indexdef from pg_indexes where indexname='av_notification_log_once_per_lead'")
[ -n "$INDEX_DEF" ] || { echo "FATAL: the once-per-lead index is missing before any mutation"; exit 1; }
trig_enabled() { q "select tgenabled from pg_trigger where tgname='athlete_programs_is_active_guard'"; }
[ "$(trig_enabled)" = O ] || { echo "FATAL: the is_active guard is not enabled before any mutation"; exit 1; }

ROUTE="app/api/admin/atletas/route.ts"; GATE="lib/features/athleteValueGate.ts"
FILES=("$ROUTE" "$GATE" "lib/atletas/athleteNotifications.ts" "app/api/atletas/notify/route.ts" \
  "lib/i18n/translate.ts" "lib/email/passLead.ts" "app/admin/atletas/page.tsx" \
  "app/atletas/gym/[partnerId]/GymAthletes.tsx" "components/door/DoorOutcomeButtons.tsx")
orig_of() { echo "$TMP/$(echo "$1" | tr '/[]' '___')"; }
for f in "${FILES[@]}"; do cp "$f" "$(orig_of "$f")"; done
restore_all() {
  apply "$TMP/claim.orig.sql"; apply "$TMP/cap.orig.sql"
  q "$INDEX_DEF" > /dev/null 2>&1 || true
  q "ALTER TABLE public.athlete_programs ENABLE TRIGGER athlete_programs_is_active_guard" > /dev/null
  reload
  for f in "${FILES[@]}"; do cp "$(orig_of "$f")" "$f"; done
}
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
all_ok=0
verdict() { # verdict <tests> <RED|GREEN>
  ONLY="$1" bash supabase/recon/t-av27b-proof.LOCAL.sh > "$TMP/out" 2>&1; rc=$?
  fails=$(grep -c '  FAIL ' "$TMP/out"); passes=$(grep -c '  PASS ' "$TMP/out")
  if [ "$2" = RED ]; then [ "$rc" != 0 ] && [ "$fails" -gt 0 ] && got=RED || got=GREEN
  else [ "$rc" = 0 ] && [ "$fails" = 0 ] && [ "$passes" -gt 0 ] && got=GREEN || got=RED; fi
  first=""; [ "$fails" -gt 0 ] && first="  first failure: $(grep -m1 '  FAIL ' "$TMP/out" | sed 's/^ *FAIL *//' | cut -c1-100)"
  [ "$fails" = 0 ] && [ "$got" = RED ] && first="  $(grep -m1 -E 'FATAL|REFUSED' "$TMP/out" | cut -c1-100)"
  printf "  %-5s test %s: %s (%s pass, %s fail)%s\n" "$([ "$got" = "$2" ] && echo OK || echo WRONG)" "$1" "$got" "$passes" "$fails" "$first"
  [ "$got" = "$2" ] || all_ok=1
}
# Unit tests run WITHOUT .env.av.local, which this script sourced for the
# database arms: with it, EMAIL_MODE=log swaps in the logging Resend client and
# every email test fails whatever the code says. That made U5 and U6 "go red"
# for the environment, not the mutation, on 2026-10-01; the original-is-green
# precheck in u_arm now catches that class before any arm is read.
unit() { # unit <test file> <RED|GREEN> [name fragment]
  env -i PATH="$PATH" HOME="$HOME" NO_COLOR=1 npx vitest run "$1" --reporter=verbose > "$TMP/u.out" 2>&1; rc=$?
  if [ "$2" = RED ]; then
    hit=$(grep -E '^\s*×' "$TMP/u.out" | grep -F "$3" | head -1)
    [ "$rc" != 0 ] && [ -n "$hit" ] && echo "  OK    $1: \"$3\" RED" || { echo "  WRONG $1: \"$3\" not red"; all_ok=1; }
  else [ "$rc" = 0 ] && echo "  OK    $1: GREEN" || { echo "  WRONG $1: not green after restore"; all_ok=1; }; fi
}
landed() { cmp -s "$1" "$(orig_of "$1")" && { echo "  FATAL: $2 did not land"; exit 1; }; echo "  mutation landed ($1 differs)"; }
restore() { cp "$(orig_of "$1")" "$1"; cmp -s "$1" "$(orig_of "$1")" && echo "  restore landed ($1 equals the original)" || { echo "  FATAL: $2 restore did not land"; exit 1; }; }
fn_mutate() { # fn_mutate <sig> <orig file> <orig md5> <old> <new> <name>
  cp "$2" "$TMP/mut.sql"; replace_once "$TMP/mut.sql" "$4" "$5" || exit 1
  apply "$TMP/mut.sql" && reload
  [ "$(md5fn "$1")" != "$3" ] && echo "  mutation landed (definition md5 changed)" || { echo "  FATAL: $6 did not land"; exit 1; }
}
fn_restore() { apply "$2" && reload; [ "$(md5fn "$1")" = "$3" ] && echo "  restore landed (definition md5 equals the original)" || { echo "  FATAL: $4 restore did not land"; exit 1; }; }

echo "== N1. the push cap always says yes (test 5 must go RED)"
fn_mutate "$CAP" "$TMP/cap.orig.sql" "$CAP_ORIG" "AND created_at > now() - interval '1 day') < 1" "AND created_at > now() - interval '1 day') < 1000" N1
replace_once "$TMP/mut.sql" "AND created_at > now() - interval '7 days') < 3" "AND created_at > now() - interval '7 days') < 1000" || exit 1
apply "$TMP/mut.sql" && reload
verdict 5 RED; fn_restore "$CAP" "$TMP/cap.orig.sql" "$CAP_ORIG" N1; verdict 5 GREEN

echo "== N2. the once-per-lead-and-event index dropped (test 2 must go RED)"
q "DROP INDEX public.av_notification_log_once_per_lead" > /dev/null
[ -z "$(q "select 1 from pg_indexes where indexname='av_notification_log_once_per_lead'")" ] && echo "  mutation landed (index gone)" || { echo "  FATAL: N2 did not land"; exit 1; }
verdict 2 RED
q "$INDEX_DEF" > /dev/null
[ "$(q "select indexdef from pg_indexes where indexname='av_notification_log_once_per_lead'")" = "$INDEX_DEF" ] && echo "  restore landed (index definition equals the original)" || { echo "  FATAL: N2 restore did not land"; exit 1; }
verdict 2 GREEN

echo "== N3. the credited check removed (test 3 must go RED)"
fn_mutate "$CLAIM" "$TMP/claim.orig.sql" "$CLAIM_ORIG" "  IF v_credited IS NOT TRUE THEN
    RETURN jsonb_build_object('success', true, 'notifications', v_out);" "  IF false THEN
    RETURN jsonb_build_object('success', true, 'notifications', v_out);" N3
verdict 3 RED; fn_restore "$CLAIM" "$TMP/claim.orig.sql" "$CLAIM_ORIG" N3

echo "== N4. the event-happened check removed (test 3 must go RED)"
fn_mutate "$CLAIM" "$TMP/claim.orig.sql" "$CLAIM_ORIG" "  IF (p_event = 'arrived' AND v_lead.attended_at IS NULL)
     OR (p_event = 'joined' AND v_lead.outcome IS DISTINCT FROM 'joined') THEN" "  IF false THEN" N4
verdict 3 RED; fn_restore "$CLAIM" "$TMP/claim.orig.sql" "$CLAIM_ORIG" N4; verdict 3 GREEN

echo "== N5. the door check removed (test 4 must go RED)"
fn_mutate "$CLAIM" "$TMP/claim.orig.sql" "$CLAIM_ORIG" "IF NOT FOUND OR NOT public.av_can_work_door(v_lead.partner_id) THEN" "IF NOT FOUND THEN" N5
verdict 4 RED; fn_restore "$CLAIM" "$TMP/claim.orig.sql" "$CLAIM_ORIG" N5; verdict 4 GREEN

ADMIN_CHECK="    if (admin.data !== true) return notFound();"
echo "== A1. the admin route's check removed; the guard trigger alone (test 9 must stay GREEN)"
replace_once "$ROUTE" "$ADMIN_CHECK" "    void admin.data;" || exit 1
landed "$ROUTE" A1; verdict 9 GREEN; restore "$ROUTE" A1

echo "== A2. the is_active guard trigger disabled; the route alone (test 9 must stay GREEN)"
q "ALTER TABLE public.athlete_programs DISABLE TRIGGER athlete_programs_is_active_guard" > /dev/null
[ "$(trig_enabled)" = D ] && echo "  mutation landed (trigger disabled)" || { echo "  FATAL: A2 did not land"; exit 1; }
verdict 9 GREEN

echo "== A3. both removed (test 9 must go RED: the owner switches their own program)"
replace_once "$ROUTE" "$ADMIN_CHECK" "    void admin.data;" || exit 1
landed "$ROUTE" A3; verdict 9 RED; restore "$ROUTE" A3
q "ALTER TABLE public.athlete_programs ENABLE TRIGGER athlete_programs_is_active_guard" > /dev/null
[ "$(trig_enabled)" = O ] && echo "  restore landed (trigger enabled)" || { echo "  FATAL: A2/A3 trigger restore did not land"; exit 1; }
verdict 9 GREEN

echo "== G1. middleware: /admin/atletas not admin-gated (test 8 must go RED)"
replace_once "$GATE" "if (pathname !== undefined && isAdminAthletesPath(pathname)) return !!userId && (await callerIsAdmin(supabase));" \
  "if (pathname !== undefined && isAdminAthletesPath(pathname)) return true; void callerIsAdmin;" || exit 1
landed "$GATE" G1; verdict 8 RED; restore "$GATE" G1; verdict 8 GREEN

echo "== U. unit arms"
u_arm() { # u_arm <file> <old> <new> <test file> <name fragment> <label>
  echo "  $6: precheck, the test file is green on the original"
  unit "$4" GREEN
  replace_once "$1" "$2" "$3" || exit 1; landed "$1" "$6"; unit "$4" RED "$5"; restore "$1" "$6"; unit "$4" GREEN
}
u_arm "lib/atletas/athleteNotifications.ts" "    if (!r.push) continue;" "    void r.push;" \
  lib/atletas/athleteNotifications.test.ts "over the cap: the in-app row, and no push" U1
u_arm "lib/atletas/athleteNotifications.ts" "\`\${options.origin}/api/notifications/send/\`" "\`\${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/send/\`" \
  lib/atletas/athleteNotifications.test.ts "pushes to the request own origin" U2
u_arm "app/api/atletas/notify/route.ts" "    if (!claimed.success) return NextResponse.json({ ok: true }, { headers: PRIVATE });" "" \
  app/api/atletas/notify/route.test.ts "a refused claim" U3
u_arm "lib/i18n/translate.ts" "  if (typeof template !== 'string') throw new Error(\`translate: \${language} \${namespace}.\${key} does not resolve\`);" \
  "  if (typeof template !== 'string') return key;" lib/i18n/translate.test.ts "an unresolvable key throws" U4
u_arm "lib/email/passLead.ts" "  if (!params.invitedBy || !params.doorUrl) return { text: [], html: [] };" "  if (!params.passCode) return { text: [], html: [] };" \
  lib/email/passLead.invitation.test.ts "a plain lead's email is unchanged" U5
u_arm "lib/email/passLead.ts" "  if (error) throw new Error(\`Resend refused the partner lead email: \${error.name}\`);" "  void error;" \
  lib/email/passLead.resendError.test.ts "rejects when Resend returns an error" U6
u_arm "$ROUTE" "$ADMIN_CHECK" "    void admin.data;" app/api/admin/atletas/route.test.ts "a non-admin is refused before any write" U7
u_arm "app/admin/atletas/page.tsx" "  if (admin.data !== true) notFound();" "  void admin.data;" \
  app/admin/atletas/page.test.tsx "a non-admin gets not-found" U8
u_arm "components/door/DoorOutcomeButtons.tsx" "      if (next === 'joined') notifyAthlete(passCode, 'joined');" "      notifyAthlete(passCode, 'joined');" \
  "app/pase/verificar/[passCode]/page.test.tsx" "a saved follow-up tells nobody" U9

echo
[ "$all_ok" = 0 ] && echo "ALL ARMS BEHAVED; every edit and restore landed" || echo "SOME ARM DID NOT BEHAVE AS EXPECTED"
exit "$all_ok"
