/**
 * Route-protection tests for the Next proxy (src/proxy.ts) in REAL production
 * mode (dev-user fallback off): session-less requests to app routes must 307 to
 * /login, while the token/secret-authed public endpoints — the webcal feed
 * (/api/calendar/<token>), the cron trigger (/api/reminders/run) and the deploy
 * healthcheck (/api/health) — must pass through untouched, because their
 * clients (calendar apps, schedulers, Railway/Docker healthchecks) never carry
 * a session cookie and each route does its own auth.
 * Run: npx tsx src/lib/proxy.agentC.test.ts
 */
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

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

/** Run the proxy against a path, optionally with the Auth.js session cookie. */
function hit(path: string, withSession = false) {
  return proxy(
    new NextRequest(`https://studyflow.test${path}`, {
      headers: withSession ? { cookie: "authjs.session-token=x" } : {},
    }),
  );
}

function isRedirectToLogin(res: Response): boolean {
  return res.status === 307 && new URL(res.headers.get("location") ?? "", "https://studyflow.test").pathname === "/login";
}

function passesThrough(res: Response): boolean {
  // NextResponse.next() marks the response instead of redirecting.
  return res.headers.get("x-middleware-next") === "1";
}

// Force the real-prod gate: production env, dev-user fallback off.
const savedNodeEnv = process.env.NODE_ENV;
const savedAllowDev = process.env.ALLOW_DEV_USER;
(process.env as Record<string, string | undefined>).NODE_ENV = "production";
delete process.env.ALLOW_DEV_USER;

try {
  // Token/secret-authed endpoints must never be redirected (they auth themselves).
  check("webcal feed /api/calendar/<token> passes without a session", passesThrough(hit("/api/calendar/some-secret-token")));
  check("cron trigger /api/reminders/run passes without a session", passesThrough(hit("/api/reminders/run")));
  check("healthcheck /api/health passes without a session", passesThrough(hit("/api/health")));

  // Session-authed routes stay gated — including the BARE /api/calendar (the
  // logged-in .ics download), which must NOT ride along with the token feed.
  check("bare /api/calendar (session .ics export) still redirects", isRedirectToLogin(hit("/api/calendar")));
  check("app page /today still redirects without a session", isRedirectToLogin(hit("/today")));
  check("push API /api/push/subscribe still redirects without a session", isRedirectToLogin(hit("/api/push/subscribe")));

  // Existing public surface + session behaviour unchanged.
  check("landing / stays public", passesThrough(hit("/")));
  check("/login stays public", passesThrough(hit("/login")));
  check("Auth.js endpoints stay public", passesThrough(hit("/api/auth/callback/google")));
  check("a session cookie passes /today", passesThrough(hit("/today", true)));

  // Dev-user fallback still bypasses the gate entirely.
  process.env.ALLOW_DEV_USER = "1";
  check("ALLOW_DEV_USER=1 bypasses the gate", passesThrough(hit("/today")));
} finally {
  (process.env as Record<string, string | undefined>).NODE_ENV = savedNodeEnv;
  if (savedAllowDev === undefined) delete process.env.ALLOW_DEV_USER;
  else process.env.ALLOW_DEV_USER = savedAllowDev;
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
