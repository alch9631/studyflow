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

# Sync the live SQLite schema BEFORE the new code starts: a build that adds a
# column (e.g. Course.passed) would otherwise restart into P2022 "column does
# not exist" 500s. Additive changes are safe for the still-running old build;
# ordered after build-green so a broken build never touches the DB, and a
# failed push aborts with the old service (old schema assumptions) untouched.
if npx prisma db push --skip-generate 2>&1 | tail -3; then
  log "db schema in sync"
else
  log "DB PUSH FAILED — aborting, leaving the old build running"
  exit 5
fi

if systemctl --user restart studyflow.service; then
  log "service restarted"
else
  log "RESTART FAILED"; exit 3
fi

sleep 4
# A healthy production instance answers /courses with a 307 to /login (real
# Google auth is on), so 200 alone is the WRONG success test — it reported
# "DEPLOY WARN" and exited 4 on every good deploy, training us to ignore it.
# Any 2xx/3xx means the app booted and is routing; only 000 (dead), 4xx or 5xx
# are real failures.
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/courses 2>/dev/null)
health=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health 2>/dev/null)
case "$code" in
  2??|3??) log "verify /courses -> HTTP $code, /api/health -> $health — DEPLOY OK" ;;
  *) log "verify /courses -> HTTP ${code:-none}, /api/health -> ${health:-none} — DEPLOY FAILED"; exit 4 ;;
esac
