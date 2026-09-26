#!/bin/bash
# S3 proof. Real JWTs, through PostgREST, against the local stack carrying
# production's schema with migration 195 applied.
#
# Uses Prefer: return=minimal throughout. The recon learned the hard way that
# return=representation makes a SUCCESSFUL cross-user insert look like a 42501
# RLS refusal, because the read-BACK is what gets denied -- so representation
# cannot distinguish "refused" from "written but unreadable".
set -u
cd /Users/alainalisca/Desktop/Projects/Tribe.Ecosystem.4.4.2026/tribe-v3-athlete
set -a; . ./.env.av.local; set +a
API="$NEXT_PUBLIC_SUPABASE_URL"; ANON="$NEXT_PUBLIC_SUPABASE_ANON_KEY"; SVC="$SUPABASE_SERVICE_ROLE_KEY"
PGURL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

ANA=00000000-0000-4000-8000-000000000001
BETO=00000000-0000-4000-8000-000000000002
ELENA=00000000-0000-4000-8000-000000000005

tok(){ curl -s -X POST "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"tribe-local-1234\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])"; }
ANAJ=$(tok ana@av.local)
[ -n "$ANAJ" ] || { echo "FATAL: no JWT"; exit 1; }
SUB=$(python3 -c "
import sys,json,base64
p='$ANAJ'.split('.')[1]; p+='='*(-len(p)%4)
print(json.loads(base64.urlsafe_b64decode(p))['sub'])")
[ "$SUB" = "$ANA" ] || { echo "FATAL: jwt sub=$SUB, expected ana"; exit 1; }
echo "JWT verified: sub=$SUB role=authenticated"
echo

pass=0; fail=0
# ins <label> <expect: ALLOW|REFUSE> <json>
ins(){
  local label="$1" expect="$2" body="$3"
  local before after code
  before=$(psql "$PGURL" -At -c "select count(*) from public.notifications where message like 'S3PROOF%';")
  code=$(curl -s -o /tmp/_s3.out -w '%{http_code}' -X POST "$API/rest/v1/notifications" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANAJ" -H 'Content-Type: application/json' \
    -H 'Prefer: return=minimal' -d "$body")
  after=$(psql "$PGURL" -At -c "select count(*) from public.notifications where message like 'S3PROOF%';")
  local wrote=$(( after - before ))
  local got; [ "$wrote" -gt 0 ] && got=ALLOW || got=REFUSE
  if [ "$got" = "$expect" ]; then
    printf "  PASS  %-52s expect=%-6s http=%-3s wrote=%s\n" "$label" "$expect" "$code" "$wrote"; pass=$((pass+1))
  else
    printf "  FAIL  %-52s expect=%-6s got=%-6s http=%-3s %s\n" "$label" "$expect" "$got" "$code" "$(head -c 120 /tmp/_s3.out)"; fail=$((fail+1))
  fi
}

echo "══ A. LEGITIMATE BROWSER PATHS -- every type the app actually sends ══"
ins "follow            ana->beto"        ALLOW "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"follow\",\"message\":\"S3PROOF follow\"}"
ins "like              ana->beto"        ALLOW "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"like\",\"message\":\"S3PROOF like\"}"
ins "join_request_approved ana->beto"    ALLOW "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"join_request_approved\",\"message\":\"S3PROOF appr\"}"
ins "join_request_declined ana->beto"    ALLOW "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"join_request_declined\",\"message\":\"S3PROOF decl\"}"
ins "training_interest ana->elena"       ALLOW "{\"recipient_id\":\"$ELENA\",\"actor_id\":\"$ANA\",\"type\":\"training_interest\",\"message\":\"S3PROOF int\"}"
ins "venue_request_new ana->elena"       ALLOW "{\"recipient_id\":\"$ELENA\",\"actor_id\":\"$ANA\",\"type\":\"venue_request_new\",\"message\":\"S3PROOF venue\"}"
ins "bulletin_pending  ana->beto"        ALLOW "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"bulletin_pending\",\"message\":\"S3PROOF bull\"}"
ins "featured_partner  ana->beto"        ALLOW "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"featured_partner\",\"message\":\"S3PROOF fp\"}"
ins "session           ana->elena"       ALLOW "{\"recipient_id\":\"$ELENA\",\"actor_id\":\"$ANA\",\"type\":\"session\",\"message\":\"S3PROOF sess\"}"
ins "profile_incomplete NULL actor ->SELF" ALLOW "{\"recipient_id\":\"$ANA\",\"type\":\"profile_incomplete\",\"message\":\"S3PROOF self nudge\"}"
ins "relative action_url /invite/tok/"   ALLOW "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"follow\",\"message\":\"S3PROOF url ok\",\"action_url\":\"/invite/abc123/\"}"

echo
echo "══ B. THE FORGED CASES ══"
ins "actor_id = ELENA (third party) ->beto" REFUSE "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ELENA\",\"type\":\"follow\",\"message\":\"S3PROOF forge actor\"}"
ins "NULL actor -> ANOTHER user"            REFUSE "{\"recipient_id\":\"$BETO\",\"type\":\"follow\",\"message\":\"S3PROOF null actor other\"}"
ins "official type 'streak_milestone'"      REFUSE "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"streak_milestone\",\"message\":\"S3PROOF official\"}"
ins "official type 'general'"               REFUSE "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"general\",\"message\":\"S3PROOF general\"}"
ins "official type 'session_reminder'"      REFUSE "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"session_reminder\",\"message\":\"S3PROOF remind\"}"
ins "action_url //evil.com/x (proto-rel)"   REFUSE "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"follow\",\"message\":\"S3PROOF protorel\",\"action_url\":\"//evil.com/x\"}"
ins "action_url https://evil.com"           REFUSE "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"follow\",\"message\":\"S3PROOF abs\",\"action_url\":\"https://evil.com\"}"
ins "action_url backslash \\\\evil.com"     REFUSE "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ANA\",\"type\":\"follow\",\"message\":\"S3PROOF backslash\",\"action_url\":\"\\\\\\\\evil.com\"}"
ins "the EXACT recon payload (actor=elena+url)" REFUSE "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ELENA\",\"type\":\"session_join\",\"message\":\"S3PROOF recon payload\",\"action_url\":\"https://example.invalid/phish\"}"

echo
echo "══ C. ANON ══"
before=$(psql "$PGURL" -At -c "select count(*) from public.notifications where message like 'S3PROOF%';")
code=$(curl -s -o /tmp/_s3a.out -w '%{http_code}' -X POST "$API/rest/v1/notifications" -H "apikey: $ANON" \
  -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
  -d "{\"recipient_id\":\"$BETO\",\"type\":\"follow\",\"message\":\"S3PROOF anon\"}")
after=$(psql "$PGURL" -At -c "select count(*) from public.notifications where message like 'S3PROOF%';")
if [ "$after" = "$before" ]; then printf "  PASS  %-52s http=%s wrote=0\n" "anon insert refused" "$code"; pass=$((pass+1));
else printf "  FAIL  anon insert WROTE A ROW\n"; fail=$((fail+1)); fi

echo
echo "══ D. SERVICE ROLE still unconstrained (smart-match / admin-notify shape) ══"
before=$(psql "$PGURL" -At -c "select count(*) from public.notifications where message like 'S3PROOF%';")
code=$(curl -s -o /tmp/_s3s.out -w '%{http_code}' -X POST "$API/rest/v1/notifications" \
  -H "apikey: $SVC" -H "Authorization: Bearer $SVC" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' \
  -d "{\"recipient_id\":\"$BETO\",\"actor_id\":\"$ELENA\",\"type\":\"smart_match\",\"message\":\"S3PROOF svc third-party actor\",\"action_url\":\"/matches/\"}")
after=$(psql "$PGURL" -At -c "select count(*) from public.notifications where message like 'S3PROOF%';")
if [ "$after" -gt "$before" ]; then printf "  PASS  %-52s http=%s wrote=1\n" "service_role: third-party actor + non-browser type" "$code"; pass=$((pass+1));
else printf "  FAIL  service_role BLOCKED -- crons would break: %s\n" "$(head -c 150 /tmp/_s3s.out)"; fail=$((fail+1)); fi

echo
echo "══ E. UPDATE / DELETE reach (item 4) ══"
# beto-addressed row exists from arm A. ana must not be able to touch it.
n=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/rest/v1/notifications?recipient_id=eq.$BETO&message=eq.S3PROOF%20follow" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANAJ" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' -d '{"is_read":true}')
changed=$(psql "$PGURL" -At -c "select count(*) from public.notifications where recipient_id='$BETO' and message='S3PROOF follow' and is_read is true;")
if [ "$changed" = "0" ]; then printf "  PASS  %-52s http=%s changed=0\n" "ana UPDATE beto's notification" "$n"; pass=$((pass+1));
else printf "  FAIL  ana MODIFIED beto's notification\n"; fail=$((fail+1)); fi

d=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/rest/v1/notifications?recipient_id=eq.$BETO&message=eq.S3PROOF%20follow" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANAJ" -H 'Prefer: return=minimal')
still=$(psql "$PGURL" -At -c "select count(*) from public.notifications where recipient_id='$BETO' and message='S3PROOF follow';")
if [ "$still" = "1" ]; then printf "  PASS  %-52s http=%s survived=1\n" "ana DELETE beto's notification" "$d"; pass=$((pass+1));
else printf "  FAIL  ana DELETED beto's notification\n"; fail=$((fail+1)); fi

# CONTROL: ana CAN update her own -- otherwise the two arms above prove nothing
u=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/rest/v1/notifications?recipient_id=eq.$ANA&message=eq.S3PROOF%20self%20nudge" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANAJ" -H 'Content-Type: application/json' -H 'Prefer: return=minimal' -d '{"is_read":true}')
own=$(psql "$PGURL" -At -c "select count(*) from public.notifications where recipient_id='$ANA' and message='S3PROOF self nudge' and is_read is true;")
if [ "$own" = "1" ]; then printf "  PASS  %-52s http=%s changed=1\n" "CONTROL: ana UPDATE her OWN (must work)" "$u"; pass=$((pass+1));
else printf "  FAIL  CONTROL failed -- the two arms above are vacuous\n"; fail=$((fail+1)); fi

echo
echo "══ F. THE TRAILBLAZER TRIGGER -- a real session insert as ana ══"
psql "$PGURL" -q -c "delete from public.area_first_sessions where grid_lat = 999;" 2>/dev/null
trg=$(psql "$PGURL" -At <<SQL 2>&1
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"$ANA","role":"authenticated"}';
INSERT INTO public.sessions (id, title, sport, date, start_time, duration, location, location_lat, location_lng, creator_id, max_participants)
VALUES (gen_random_uuid(), 'S3PROOF trailblazer', 'Running', current_date + 1, '09:00', 60, 'Nueva Zona S3',
        9.99, 9.99, '$ANA', 5);
SELECT 'notif_written=' || count(*) FROM public.notifications
 WHERE recipient_id = '$ANA' AND type = 'achievement';
ROLLBACK;
SQL
)
echo "$trg" | grep -q "notif_written=1" \
  && { printf "  PASS  %-52s %s\n" "session insert fires trg_first_in_area, bell written" "$(echo "$trg"|grep notif_written)"; pass=$((pass+1)); } \
  || { printf "  FAIL  Trailblazer trigger blocked -- SESSION CREATION WOULD BREAK\n%s\n" "$trg"; fail=$((fail+1)); }

echo
echo "── cleanup ──"
psql "$PGURL" -q -c "delete from public.notifications where message like 'S3PROOF%';"
echo "  remaining S3PROOF rows: $(psql "$PGURL" -At -c "select count(*) from public.notifications where message like 'S3PROOF%';")"
echo
echo "════ $pass passed, $fail failed ════"
[ "$fail" -eq 0 ] || exit 1
