// Bootstrap Prisma for tests / CI from a clean checkout: generate the client,
// then push the schema to the DB. Defaults DATABASE_URL to the local SQLite file
// when it's unset, so `git clone && npm install && npm test` works with no env.
import { spawnSync } from "node:child_process";

// Default DATABASE_URL (?=) so tests run with zero env. Matches .env.example.
process.env.DATABASE_URL ??= "file:./dev.db";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(args) {
  console.log(`> npx ${args.join(" ")}`);
  const result = spawnSync(npx, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["prisma", "generate"]);
run(["prisma", "db", "push", "--skip-generate"]);
