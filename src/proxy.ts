import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection (Next 16 Proxy, formerly Middleware): unauthenticated
 * requests to app routes are redirected to /login. It does NOT import
 * src/auth.ts (the PrismaAdapter pulls in heavy Node-only Prisma); instead it
 * does a cheap presence check of the Auth.js session cookie — enough to gate
 * page navigation; the real session is still verified server-side by auth() in
 * getCurrentUserId().
 *
 * The dev-user fallback (every request treated as authed, no sign-in) is on in
 * any non-production environment, or when ALLOW_DEV_USER=1 is set explicitly
 * (e.g. the Pi running in production with no Google creds) — mirrors
 * getCurrentUserId()'s predicate.
 */

// Public routes that never require a session.
const PUBLIC_PATHS = new Set(["/", "/login", "/offline"]);

// Auth.js names its session cookie `authjs.session-token`, and on https it uses
// the `__Secure-` prefix. Either one being present means "has a session".
function hasSessionCookie(req: NextRequest): boolean {
  return (
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token")
  );
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Auth.js endpoints (sign-in/callback/sign-out) must stay reachable.
  if (pathname.startsWith("/api/auth/")) return true;
  // PWA + static assets.
  if (pathname === "/manifest.webmanifest" || pathname === "/sw.js") return true;
  return false;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const devAllowed =
    process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_USER === "1";
  if (devAllowed) return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();
  if (hasSessionCookie(req)) return NextResponse.next();

  const loginUrl = new URL("/login", req.nextUrl);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Skip Next internals and obvious static files; the matcher excludes anything
  // with a file extension (icons, images, etc.) so assets are never gated.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
