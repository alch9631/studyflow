import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./apiError";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const SESSION_MS = 30 * 86400_000;
export const mobileHash = (value: string) => createHash("sha256").update(value).digest("base64url");

export function mobileCallback(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new ApiError("BAD_REQUEST", "Invalid app callback."); }
  if (url.username || url.password || url.search || url.hash) throw new ApiError("BAD_REQUEST", "Invalid app callback.");
  if (url.href === "studyflow://auth/callback") return url.href;
  // Expo Go uses a LAN deep link; release builds only accept our registered scheme.
  if (process.env.NODE_ENV !== "production" && url.protocol === "exp:" && url.pathname === "/--/auth/callback" &&
    /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname)) return url.href;
  throw new ApiError("BAD_REQUEST", "Invalid app callback.");
}

export function validateMobileAuthorization(challenge: string, state: string, callback: string) {
  if (!TOKEN_PATTERN.test(challenge) || !TOKEN_PATTERN.test(state)) throw new ApiError("BAD_REQUEST", "Invalid app sign-in request.");
  return { challenge, state, callback: mobileCallback(callback) };
}

export async function createMobileGrant(userId: string, challenge: string) {
  if (!TOKEN_PATTERN.test(challenge)) throw new ApiError("BAD_REQUEST", "Invalid sign-in challenge.");
  const code = randomBytes(32).toString("base64url");
  await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: "mobile:" }, expires: { lte: new Date() } } });
  await prisma.verificationToken.create({ data: {
    identifier: `mobile:${challenge}:${userId}`, token: mobileHash(code), expires: new Date(Date.now() + 120_000),
  } });
  return code;
}

async function newSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_MS);
  await prisma.session.create({ data: { userId, sessionToken: `mobile:${mobileHash(token)}`, expires } });
  return { token, expiresAt: expires.toISOString(), userId };
}

export async function createDevelopmentMobileSession() {
  // ALLOW_DEV_USER never enables this route on a production server.
  if (process.env.NODE_ENV === "production") throw new ApiError("UNAUTHORIZED", "Sign in to connect your account.");
  const { getCurrentUserId } = await import("./devUser");
  return newSession(await getCurrentUserId());
}

export async function exchangeMobileGrant(code: string, verifier: string) {
  if (!TOKEN_PATTERN.test(code) || !VERIFIER_PATTERN.test(verifier)) throw new ApiError("UNAUTHORIZED", "Sign-in expired. Please try again.");
  const prefix = `mobile:${mobileHash(verifier)}:`;
  const token = mobileHash(code);
  const grant = await prisma.verificationToken.findFirst({ where: { token, identifier: { startsWith: prefix }, expires: { gt: new Date() } } });
  if (!grant) throw new ApiError("UNAUTHORIZED", "Sign-in expired. Please try again.");
  const userId = grant.identifier.slice(prefix.length);
  const raw = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_MS);
  return prisma.$transaction(async (tx) => {
    const consumed = await tx.verificationToken.deleteMany({ where: { identifier: grant.identifier, token, expires: { gt: new Date() } } });
    if (consumed.count !== 1 || !await tx.user.count({ where: { id: userId } })) throw new ApiError("UNAUTHORIZED", "Sign-in expired. Please try again.");
    await tx.session.create({ data: { userId, sessionToken: `mobile:${mobileHash(raw)}`, expires } });
    return { token: raw, expiresAt: expires.toISOString(), userId };
  });
}

export async function mobileIdentity(request: Request) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) throw new ApiError("UNAUTHORIZED", "Sign in to continue.");
  const sessionToken = `mobile:${mobileHash(token)}`;
  const session = await prisma.session.findUnique({ where: { sessionToken }, select: { userId: true, expires: true } });
  if (!session || session.expires.getTime() <= Date.now()) throw new ApiError("UNAUTHORIZED", "Your session expired. Please sign in again.");
  return { userId: session.userId, sessionToken };
}
