#!/bin/bash
# Sourced by the T-AV mutation drivers (t-av21-mutations, t-av22-mutations).
# Needs q() (psql -At against the LOCAL database) and apply() (psql -f).
#
# WHY THIS EXISTS (2026-09-30). The T-AV21 driver restored the claim policy
# from 201's text. After 204 the live policy has eight more clauses, so that
# "restore" silently removed them: re-running T-AV21's mutations against a
# T-AV22 database reopened F2 locally. Its own restore assertion caught it
# (restored text != original text), and its exit trap then re-applied the
# stale text anyway. A mutation driver must restore what WAS live, not what
# some migration file once said, because a later migration can supersede the
# file and nothing tells the driver.
#
# So: capture the LIVE policy, refuse unless its shape is the one this
# rebuilds (roles {public}, INSERT, and PERMISSIVE or RESTRICTIVE as the
# caller names), and prove the capture round-trips byte for byte before
# anything is mutated. Since 208 there are two such policies on pass_leads.

CLAIM_POLICY_SQL="select with_check from pg_policies where schemaname='public' and tablename='pass_leads' and policyname='Anyone can claim a pass'"
SERVER_ONLY_POLICY_SQL="select with_check from pg_policies where schemaname='public' and tablename='pass_leads' and policyname='Program columns are server only'"

# capture_insert_policy <policy name> <PERMISSIVE|RESTRICTIVE> <file>: writes
# one transaction that recreates that LIVE INSERT policy on pass_leads
# exactly, applies it, and checks the text did not move.
capture_insert_policy() {
  local name="$1" kind="$2" out="$3" shape check after as=""
  shape=$(q "select roles::text||'|'||cmd||'|'||permissive from pg_policies where schemaname='public' and tablename='pass_leads' and policyname='$name'")
  if [ "$shape" != "{public}|INSERT|$kind" ]; then
    echo "FATAL: policy \"$name\" has shape '$shape', not {public}|INSERT|$kind; refusing to rebuild it"
    return 1
  fi
  check=$(q "select with_check from pg_policies where schemaname='public' and tablename='pass_leads' and policyname='$name'")
  [ -n "$check" ] || { echo "FATAL: policy \"$name\" has no WITH CHECK"; return 1; }
  [ "$kind" = RESTRICTIVE ] && as=" AS RESTRICTIVE"
  printf 'BEGIN;\nDROP POLICY IF EXISTS "%s" ON public.pass_leads;\nCREATE POLICY "%s" ON public.pass_leads%s FOR INSERT WITH CHECK (%s);\nCOMMIT;\n' \
    "$name" "$name" "$as" "$check" > "$out"
  apply "$out" || { echo "FATAL: the captured policy \"$name\" does not apply"; return 1; }
  after=$(q "select with_check from pg_policies where schemaname='public' and tablename='pass_leads' and policyname='$name'")
  if [ "$after" != "$check" ]; then
    echo "FATAL: the captured policy \"$name\" does not round-trip; restoring from it would change it"
    return 1
  fi
}

capture_claim_policy() { capture_insert_policy 'Anyone can claim a pass' PERMISSIVE "$1"; }
capture_server_only_policy() { capture_insert_policy 'Program columns are server only' RESTRICTIVE "$1"; }
