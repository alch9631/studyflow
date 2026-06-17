import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection: unauthenticated requests to app routes are redirected to
 * /login. Runs on the Edge runtime, so it does NOT import src/auth.ts (the
 * PrismaAdapter pulls in Node-only Prisma). Instead it does a cheap presence
 * check of the Auth.js session cookie — enough to gate page navigation; the real
 * session is still verified server-side by auth() in getCurrentUserId().
 *
 * When ALLOW_DEV_USER=1 (local dev / the Pi, no Google creds) every request is
 * treated as authed so existing flows keep working with no sign-in.
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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (process.env.ALLOW_DEV_USER === "1") return NextResponse.next();
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
