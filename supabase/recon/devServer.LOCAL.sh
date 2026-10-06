#!/bin/bash
# Sourced by the T-AV proofs that need the app itself (t-av21-proof test 11,
# t-av23-proof, t-av24-proof). Needs $ROOT and $TMP (a scratch dir the caller
# owns). Sets $APP.
#
# The dev server is OWNED by the sourcing script: started with a given
# ATHLETE_VALUE_ENABLED (a real env var wins over .env.av.local in av-dev.mjs,
# and ATHLETE_VALUE_FEATURES is removed so every feature is listed), and
# stopped before any restart and on exit. It waits for the pass page to
# answer 200 rather than for a log line, because the first request compiles.
#
# ITS OWN PORT, AND IT ONLY EVER STOPS ITS OWN SERVER (2026-09-30). The first
# version used port 3001 and stopped servers with `pkill -f "next dev -p
# 3001"`, which matches ANY project's dev server on that port. A different
# project's `npm run dev` was on 3001 when T-AV24 ran; the proofs' port check
# refused before anything was killed, but a helper must not depend on that.
# So: a dedicated proof port (3101 unless AV_PROOF_PORT says otherwise), and
# stopping means the PID this script started, its child processes, and a
# `next dev` whose path is inside THIS repo, nothing else.

AV_PROOF_PORT="${AV_PROOF_PORT:-3101}"
APP="http://localhost:$AV_PROOF_PORT"

port_busy() { lsof -nP -iTCP:"$AV_PROOF_PORT" -sTCP:LISTEN >/dev/null 2>&1; }

kill_tree() { # kill_tree <pid>: the process and every descendant
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill "$1" 2>/dev/null
}

stop_server() {
  [ -f "$TMP/dev.pid" ] && kill_tree "$(cat "$TMP/dev.pid")"
  rm -f "$TMP/dev.pid"
  pkill -f "$ROOT/node_modules/.bin/next dev -p $AV_PROOF_PORT" 2>/dev/null
  for _ in $(seq 1 30); do port_busy || return 0; sleep 1; done
  echo "FATAL: port $AV_PROOF_PORT did not free up"; exit 1
}

start_server() { # start_server <ATHLETE_VALUE_ENABLED>
  stop_server
  # T-AV29: the app's public origin is the proof server itself, so a voucher
  # QR or a door link built in a proof points here and not at the stale
  # NEXT_PUBLIC_SITE_URL in .env.av.local. A proof that must tell the public
  # origin apart from request.url sets AV_SITE_URL to a different address.
  (env -u ATHLETE_VALUE_FEATURES ATHLETE_VALUE_ENABLED="$1" PORT="$AV_PROOF_PORT" NEXT_PUBLIC_SITE_URL="${AV_SITE_URL:-$APP}" node scripts/av-dev.mjs > "$TMP/dev.log" 2>&1 & echo $! > "$TMP/dev.pid")
  for _ in $(seq 1 180); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$APP/pase/bullbox-prueba/")" = 200 ] && { FLAG="$1"; return 0; }
    sleep 1
  done
  echo "FATAL: dev server with flag=$1 did not serve /pase/bullbox-prueba/ in 180s"; tail -20 "$TMP/dev.log"; exit 1
}
