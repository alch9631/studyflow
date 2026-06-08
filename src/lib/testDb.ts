/**
 * Test database bootstrap.
 *
 * Route/integration tests import this module FIRST (before anything that pulls
 * in `./db`) so every PrismaClient built in the process talks to a dedicated,
 * throwaway SQLite database instead of the real dev/prod DB. This guarantees no
 * test ever reads or mutates dev data — the test DB is deleted and re-migrated
 * fresh on each run.
 *
 * Usage — put this as the VERY FIRST import in a DB-touching test:
 *   import "./testDb";          // must precede `./db` (which reads DATABASE_URL
 *   import { prisma } from "./db";   // at module-load time to build its client)
 *
 * Override the location with TEST_DATABASE_URL (must still be a *test* db).
 */
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolve (and validate) the test database URL. Kept pure so it's unit-testable
 * without side effects. Refuses anything that isn't an obvious throwaway test db
 * (e.g. `file:./dev.db`) — a guardrail so a misconfigured env can never point
 * the reset/migrate step at dev or prod data.
 */
export function resolveTestDbUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url = env.TEST_DATABASE_URL ?? "file:./test.db";
  const file = url.startsWith("file:") ? url.slice("file:".length) : null;
  if (file === null || !/(^|\/)test[\w.-]*\.db$/.test(file)) {
    throw new Error(
      `Refusing to use a non-test database for tests: ${url} ` +
        `(expected a file like "file:./test.db")`,
    );
  }
  return url;
}

/**
 * On-disk location of the test SQLite file. Prisma resolves a relative `file:`
 * URL against the directory holding `schema.prisma` (i.e. `prisma/`), not cwd —
 * so we must mirror that here for the delete/reset to hit the real file.
 */
export function testDbFilePath(url: string = resolveTestDbUrl()): string {
  const file = url.slice("file:".length);
  return resolve(process.cwd(), "prisma", file);
}

const TEST_DATABASE_URL = resolveTestDbUrl();

// Point this process's Prisma client at the test DB. Set before `./db` loads.
process.env.DATABASE_URL = TEST_DATABASE_URL;

// Reset: delete the file for a clean slate, then push the current schema so the
// tables exist. `--skip-generate` keeps it fast (the client is already generated)
// and the explicit env makes prisma ignore the dev `.env` DATABASE_URL.
const filePath = testDbFilePath(TEST_DATABASE_URL);
for (const f of [filePath, `${filePath}-journal`, `${filePath}-wal`, `${filePath}-shm`]) {
  if (existsSync(f)) rmSync(f);
}
execSync("npx prisma db push --skip-generate", {
  env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  stdio: "ignore",
});
