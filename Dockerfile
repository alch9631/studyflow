# syntax=docker/dockerfile:1
# Portable production image for StudyFlow (Next.js standalone + Prisma).
# Build:  docker build -t studyflow .
# Run:    docker run -p 3000:3000 -e DATABASE_URL=... studyflow
# Debian-slim base (not alpine) so Prisma's query engine runs without musl quirks.

# ---- deps: install node_modules from a clean lockfile ----
FROM node:24-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- builder: generate Prisma client + build the standalone server ----
FROM node:24-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL is a runtime concern; a dummy value keeps any module-load Prisma
# client happy during `next build` (all data pages are force-dynamic, no DB hit).
ENV DATABASE_URL="file:./build.db"
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* vars are inlined into the client bundle at BUILD time — they
# cannot be injected at runtime. Without the VAPID public key baked in here the
# push-reminders UI is permanently stuck on "coming soon" in any Docker deploy.
# Pass it at build time:
#   docker build --build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY=... .
# (Railway forwards a service variable of the same name as a build arg because
# this ARG is declared.) Leaving it unset keeps push cleanly disabled.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
RUN npx prisma generate && npm run build

# ---- runner: minimal image, non-root, just the standalone output ----
FROM node:24-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs

# Next standalone bundles its own traced node_modules + server.js.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Schema + migrations so a deploy step can run `prisma migrate deploy` if desired.
COPY --from=builder /app/prisma ./prisma

# Persist data written at runtime across container restarts. If you run with a
# SQLite DATABASE_URL, point it INSIDE this volume so the DB survives redeploys —
# an ephemeral container filesystem loses it on every restart:
#   -v studyflow-data:/app/data -e DATABASE_URL="file:/app/data/prod.db"
# (Postgres/Railway users ignore this — DATABASE_URL points at the DB service.)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
VOLUME ["/app/data"]

# Container-level healthcheck (Railway has its own; this covers a bare
# `docker run`). The slim base has no curl/wget, so probe with node's http.
# Hits /api/health, which returns 503 when the DB is unreachable (unlike "/",
# which swallows DB errors and 200s), so a broken DB fails the check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "require('http').get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/api/health'},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"]

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
