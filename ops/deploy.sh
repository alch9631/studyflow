#!/usr/bin/env bash
# Deploy the live StudyFlow Pi instance from current origin/main.
# Build-first, restart-only-if-build-green (never take the live site down on a bad build).
# Invoked by controller.sh once per drained batch (ALL_DONE). Logs to ops/deploy-last.log.
set -uo pipefail
cd /home/pipi/.openclaw/workspace/studyflow || exit 1
log(){ echo "[$(date '+%F %T')] $*"; }

log "=== deploy start (HEAD $(git rev-parse --short HEAD 2>/dev/null)) ==="
git fetch origin -q 2>/dev/null
git pull --rebase --autostash origin main >/dev/null 2>&1 || log "WARN: pull/rebase noisy — building current HEAD"
log "building commit $(git rev-parse --short HEAD 2>/dev/null)"

npm ci 2>&1 | tail -4
export NODE_OPTIONS=--max-old-space-size=2560
if npm run build 2>&1 | tail -10; then
  log "build OK"
else
  log "BUILD FAILED — aborting, leaving the old build running"
  exit 2
fi

if systemctl --user restart studyflow.service; then
  log "service restarted"
else
  log "RESTART FAILED"; exit 3
fi

sleep 4
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/courses 2>/dev/null)
if [ "$code" = "200" ]; then
  log "verify /courses -> HTTP 200 — DEPLOY OK"
else
  log "verify /courses -> HTTP ${code:-none} — DEPLOY WARN (service up but route not 200)"; exit 4
fi
