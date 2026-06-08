/**
 * Tests for the test-DB bootstrap helper.
 *
 * Importing "./testDb" runs the bootstrap: it points DATABASE_URL at a throwaway
 * test database and resets+migrates it. We assert that side effect happened, and
 * that the pure URL resolver only ever accepts an obvious *test* database (so it
 * can never be tricked into wiping dev/prod data).
 * Run: npx tsx src/lib/testDb.test.ts
 */
import "./testDb";
import { resolveTestDbUrl, testDbFilePath } from "./testDb";
import { existsSync } from "node:fs";

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

function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

// --- Bootstrap side effect: DATABASE_URL now points at the test DB, which exists.
check(
  "import points DATABASE_URL at a test db",
  /test[\w.-]*\.db$/.test(process.env.DATABASE_URL ?? ""),
);
check(
  "the test db file was created (migrated) on import",
  existsSync(testDbFilePath(process.env.DATABASE_URL ?? "")),
);

// --- Pure resolver: default and explicit test URLs are accepted.
check("defaults to file:./test.db", resolveTestDbUrl({}) === "file:./test.db");
check(
  "honors a TEST_DATABASE_URL test override",
  resolveTestDbUrl({ TEST_DATABASE_URL: "file:./test-x.db" }) === "file:./test-x.db",
);

// --- Pure resolver: non-test URLs are refused (guardrail against wiping dev data).
check("refuses file:./dev.db", throws(() => resolveTestDbUrl({ TEST_DATABASE_URL: "file:./dev.db" })));
check("refuses file:./prod.db", throws(() => resolveTestDbUrl({ TEST_DATABASE_URL: "file:./prod.db" })));
check(
  "refuses a non-file url",
  throws(() => resolveTestDbUrl({ TEST_DATABASE_URL: "postgres://x/test.db" })),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
