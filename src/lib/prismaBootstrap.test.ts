/**
 * Tests for the Prisma bootstrap's DATABASE_URL resolution.
 *
 * The bootstrap (`scripts/prisma-bootstrap.mjs`) is what makes a clean checkout
 * runnable with zero env: `git clone && npm install && npm test`. The actual
 * prisma generate/push is integration-covered by the full test run; here we lock
 * in the *pure* contract that a clean clone (no .env, empty env) still resolves a
 * usable default URL, while any explicit DATABASE_URL is always honored.
 * Run: npx tsx src/lib/prismaBootstrap.test.ts
 */
import { DEFAULT_DATABASE_URL, resolveDatabaseUrl } from "../../scripts/prisma-bootstrap.mjs";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

// Clean clone: no DATABASE_URL at all -> falls back to the local SQLite default.
check("empty env falls back to the local SQLite default", resolveDatabaseUrl({}) === DEFAULT_DATABASE_URL);
check("default is a file: SQLite url", DEFAULT_DATABASE_URL.startsWith("file:"));

// An explicit value is always honored (dev/CI/prod overrides win).
check(
  "honors an explicit DATABASE_URL",
  resolveDatabaseUrl({ DATABASE_URL: "file:./custom.db" }) === "file:./custom.db",
);
check(
  "honors a postgres DATABASE_URL (prod)",
  resolveDatabaseUrl({ DATABASE_URL: "postgresql://u:p@h:5432/db" }) === "postgresql://u:p@h:5432/db",
);

// Only `undefined` triggers the fallback (??), so an explicit empty string is
// left as-is rather than masked — a misconfig should surface, not get papered over.
check("an explicit empty string is left untouched", resolveDatabaseUrl({ DATABASE_URL: "" }) === "");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
