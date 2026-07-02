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
import {
  DEFAULT_DATABASE_URL,
  npxInvocation,
  resolveDatabaseUrl,
} from "../../scripts/prisma-bootstrap.mjs";

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

// --- npxInvocation: cross-platform spawn contract ---
// Windows must go through the shell: npx is a .cmd shim, and Node >= 20 throws
// EINVAL spawning .cmd files without one (CVE-2024-27980 mitigation). Every
// other platform keeps the direct, shell-less spawn (identical to before).
{
  const win = npxInvocation("win32");
  check("win32 spawns npx through the shell", win.command === "npx" && win.shell === true);
  const linux = npxInvocation("linux");
  check("linux keeps the direct shell-less spawn", linux.command === "npx" && linux.shell === false);
  const mac = npxInvocation("darwin");
  check("darwin keeps the direct shell-less spawn", mac.command === "npx" && mac.shell === false);
  check("defaults to the current platform", npxInvocation().shell === (process.platform === "win32"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
