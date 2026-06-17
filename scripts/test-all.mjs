// Run every `test:*` script from package.json sequentially.
// Auto-discovers suites so new test:* scripts are picked up without edits here.
// Exits non-zero on the first failing suite (fail-fast, deterministic order).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Default DATABASE_URL (?=) so suites that touch Prisma run with zero env, e.g.
// a clean `git clone && npm install && npm test`. Matches .env.example.
process.env.DATABASE_URL ??= "file:./dev.db";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const suites = Object.keys(pkg.scripts ?? {})
  .filter((name) => name.startsWith("test:"))
  .sort();

if (suites.length === 0) {
  console.error("No test:* scripts found in package.json.");
  process.exit(1);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

for (const suite of suites) {
  console.log(`\n=== ${suite} ===`);
  const result = spawnSync(npm, ["run", suite], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\n✗ ${suite} failed (exit ${result.status ?? "signal"}).`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\n✓ All ${suites.length} test suites passed.`);
