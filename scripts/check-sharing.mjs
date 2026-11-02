// Read normal Next.js environment files; report variable names, never secrets.
import nextEnv from "@next/env";
import { pathToFileURL } from "node:url";

export function sharingIssues(env) {
  const issues = [];
  if (env.NODE_ENV !== "production") issues.push("NODE_ENV must be production");
  if (env.ALLOW_DEV_USER === "1") issues.push("Disable ALLOW_DEV_USER: it shares one account with every visitor");
  for (const key of ["DATABASE_URL", "AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]) {
    if (!env[key]?.trim()) issues.push(`Set ${key}`);
  }
  if (env.AUTH_SECRET?.trim() && env.AUTH_SECRET.trim().length < 32) issues.push("AUTH_SECRET must have at least 32 random characters");
  if (env.AUTH_SECRET?.includes("studyflow-dev-only")) issues.push("Replace the public development AUTH_SECRET with a random secret");
  try {
    const origin = new URL(env.AUTH_URL);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
        !origin.hostname.includes(".") || /(^|\.)(localhost|local|lan|example|test|invalid)$/.test(origin.hostname) ||
        /(^|\.)(example\.com|trycloudflare\.com)$/.test(origin.hostname) ||
        /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin.hostname)) {
      throw new Error();
    }
  } catch {
    issues.push("Set AUTH_URL to the permanent public HTTPS origin, without a path");
  }
  const emails = (env.AUTH_ALLOWED_EMAILS ?? "").split(/[,;\s]+/).filter(Boolean);
  if (emails.some((email) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.includes("*") || email.endsWith("@example.com"))) {
    issues.push("Leave AUTH_ALLOWED_EMAILS empty for open Google sign-up, or set exact real email addresses");
  }
  if (env.DATABASE_URL?.startsWith("file:")) {
    const file = env.DATABASE_URL.slice(5);
    if (!file.startsWith("/") || file.split("/").some((part) => [".next", "release", "releases"].includes(part) || part.startsWith("release-"))) {
      issues.push("Use an absolute SQLite DATABASE_URL outside release directories");
    }
  }
  return issues;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  nextEnv.loadEnvConfig(process.cwd(), false);
  const issues = sharingIssues(process.env);
  for (const issue of issues) console.error(`- ${issue}`);
  if (!issues.length) {
    console.log("Sharing configuration passed. Verify two Google accounts and the public URL before inviting friends.");
    console.log(`Google callback: ${new URL("/api/auth/callback/google", process.env.AUTH_URL).href}`);
  }
  process.exitCode = issues.length ? 1 : 0;
}
