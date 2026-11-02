import { randomBytes } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const directory = path.join(homedir(), ".config", "studyflow");
const target = path.join(directory, "sharing.env");
await mkdir(directory, { recursive: true, mode: 0o700 });
let file;
try {
  file = await open(target, "wx", 0o600);
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(`Existing sharing configuration preserved: ${target}`);
  process.exit(0);
}
try {
  const template = await readFile(new URL("../ops/sharing.env.example", import.meta.url), "utf8");
  await file.writeFile(template.replace(/^AUTH_SECRET=$/m, `AUTH_SECRET=${randomBytes(48).toString("base64url")}`));
} finally {
  await file.close();
}
console.log(`Private configuration prepared: ${target}`);
console.log("Session secret generated. Add Google OAuth credentials locally, then run sharing:check with this environment file. The default permits any verified Google account.");
