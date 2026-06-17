// Bootstrap Prisma for tests / CI from a clean checkout: generate the client,
// then push the schema to the DB. Defaults DATABASE_URL to the local SQLite file
// when it's unset, so `git clone && npm install && npm test` works with no env.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Default DATABASE_URL for a clean checkout. Matches .env.example so tests run
// with zero env (a bare `git clone && npm install && npm test`).
export const DEFAULT_DATABASE_URL = "file:./dev.db";

// Pure (no side effects): the effective DATABASE_URL. Falls back to the local
// SQLite file only when truly unset, so an explicit value is always honored.
/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function resolveDatabaseUrl(env = process.env) {
  return env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

function bootstrap() {
  // Set before invoking prisma so a clean checkout (no .env) still has a target.
  process.env.DATABASE_URL = resolveDatabaseUrl();

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  function run(args) {
    console.log(`> npx ${args.join(" ")}`);
    const result = spawnSync(npx, args, { stdio: "inherit", env: process.env });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  run(["prisma", "generate"]);
  run(["prisma", "db", "push", "--skip-generate"]);
}

// Run the bootstrap only when invoked directly (`node scripts/prisma-bootstrap.mjs`),
// so importing this module in a test has no side effects.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  bootstrap();
}
