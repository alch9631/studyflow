import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allowedEmails, canSignInWithGoogle, isAllowedEmail } from "./authPolicy";
import { sharingIssues } from "../../scripts/check-sharing.mjs";
import { GET as versionGET } from "../app/api/version/route";

async function main() {
  const invitations = " Owner@school.de,friend@gmail.com; owner@school.de\nother@school.de ";
  assert.deepEqual(allowedEmails(invitations), ["owner@school.de", "friend@gmail.com", "other@school.de"]);
  assert.equal(isAllowedEmail("OWNER@school.de", invitations), true);
  assert.equal(isAllowedEmail("owner@school.de.attacker.com", invitations), false);
  assert.equal(isAllowedEmail("owner+other@school.de", invitations), false);
  assert.equal(isAllowedEmail("anyone@school.de", ""), true);
  assert.equal(isAllowedEmail(null, invitations), false);
  const profile = { email: "friend@gmail.com", email_verified: true };
  assert.equal(canSignInWithGoogle("google", profile, invitations), true);
  assert.equal(canSignInWithGoogle("google", { email: "arbitrary@gmail.com", email_verified: true }, ""), true);
  assert.equal(canSignInWithGoogle("google", { ...profile, email_verified: false }, invitations), false);
  assert.equal(canSignInWithGoogle("google", { email: profile.email }, invitations), false);
  assert.equal(canSignInWithGoogle("google", { ...profile, email_verified: "true" }, invitations), false);
  assert.equal(canSignInWithGoogle("other", profile, invitations), false);
  assert.equal(canSignInWithGoogle("google", undefined, invitations), false);
  assert.equal(canSignInWithGoogle("google", profile, "owner@school.de"), false);

  const good = {
    NODE_ENV: "production", ALLOW_DEV_USER: "0", DATABASE_URL: "file:/data/studyflow.db",
    AUTH_SECRET: "a".repeat(44), AUTH_GOOGLE_ID: "client", AUTH_GOOGLE_SECRET: "secret",
    AUTH_URL: "https://studyflow.school.de", AUTH_ALLOWED_EMAILS: invitations,
  };
  assert.deepEqual(sharingIssues(good), []);
  for (const change of [
    { NODE_ENV: "development" }, { ALLOW_DEV_USER: "1" }, { AUTH_SECRET: "" },
    { AUTH_SECRET: "short" }, { AUTH_GOOGLE_ID: "" }, { AUTH_GOOGLE_SECRET: "" },
    { AUTH_SECRET: "studyflow-dev-only-insecure-auth-secret" },
    { AUTH_URL: "http://studyflow.school.de" }, { AUTH_URL: "https://studyflow.school.de/path" },
    { AUTH_URL: "https://studyflow.example.com" },
    { AUTH_URL: "https://127.0.0.1" }, { AUTH_URL: "https://random.trycloudflare.com" },
    { AUTH_ALLOWED_EMAILS: "*@gmail.com" }, { DATABASE_URL: "file:./dev.db" },
    { DATABASE_URL: "file:/app/.next/production.db" },
  ]) assert.ok(sharingIssues({ ...good, ...change }).length > 0, JSON.stringify(change));
  assert.deepEqual(sharingIssues({ ...good, AUTH_ALLOWED_EMAILS: "" }), []);

  const cwd = process.cwd();
  const root = await mkdtemp(join(tmpdir(), "studyflow-version-test-"));
  try {
    process.chdir(root);
    assert.deepEqual(await (await versionGET()).json(), { buildId: null });
    await mkdir(".next");
    await writeFile(".next/BUILD_ID", "old-release\n");
    const old = await versionGET();
    assert.equal(old.headers.get("Cache-Control"), "no-store, max-age=0");
    assert.deepEqual(await old.json(), { buildId: "old-release" });
    await writeFile(".next/BUILD_ID", "new-release\n");
    assert.deepEqual(await (await versionGET()).json(), { buildId: "new-release" });
  } finally {
    process.chdir(cwd);
    await rm(root, { recursive: true, force: true });
  }
  console.log("Sharing policy, configuration guards and live version checks passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
