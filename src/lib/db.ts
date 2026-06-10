import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  invalidateAllStats,
  invalidateUserStats,
  shouldInvalidateStats,
  statsWriteOwner,
} from "./statsCache";

// Next.js and the Prisma CLI load .env automatically, but standalone scripts
// (seeds, smoke test) run under bare tsx and don't. Fill missing vars from .env
// so `npm run setup`, `db:seed`, and `smoke` work with no DATABASE_URL prefix.
if (!process.env.DATABASE_URL && existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

// Build the shared client with a write-through hook that keeps the stats cache
// honest: after any mutation to a stats-relevant model (Course / Topic /
// StudyBlock) we drop the cache, so the next Insights / /api/stats read recomputes
// from fresh data. This is what makes `statsCache` safe to use — no write path can
// silently leave stale analytics behind, and we explicitly do NOT invalidate on
// the per-request `user.upsert` (dev auth) or unrelated writes, so the cache
// actually survives between mutations. When the write's args reveal the owning
// userId (course create / ownership-scoped update & delete) we invalidate only
// that user, so an unrelated user's still-fresh analytics survive the mutation;
// otherwise (a topic/block write keyed only by row id) we fall back to a full
// clear, which is conservative but never stale.
function makeClient() {
  return new PrismaClient().$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          if (shouldInvalidateStats(model, operation)) {
            const owner = statsWriteOwner(model, operation, args);
            if (owner) invalidateUserStats(owner);
            else invalidateAllStats();
          }
          return result;
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof makeClient>;

// Reuse one client across hot-reloads in dev (avoids connection storms).
const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
