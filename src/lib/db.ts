import { readFileSync, existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// Next.js and the Prisma CLI load .env automatically, but standalone scripts
// (seeds, smoke test) run under bare tsx and don't. Fill missing vars from .env
// so `npm run setup`, `db:seed`, and `smoke` work with no DATABASE_URL prefix.
if (!process.env.DATABASE_URL && existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

// Reuse one PrismaClient across hot-reloads in dev (avoids connection storms).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
