import { ApiError, handleApiError } from "@/lib/apiError";
import { prisma } from "@/lib/db";
import { createDevelopmentMobileSession, exchangeMobileGrant, mobileHash, mobileIdentity } from "@/lib/mobileAuth";
import { mobileFinish, mobileFocus, mobileSaveProgress, mobileToday } from "@/lib/mobileStudy";
import { checkRateLimit } from "@/lib/rateLimitPolicy";
import { materialResponse, readMaterial } from "@/lib/materials";

export const dynamic = "force-dynamic";

async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError("BAD_REQUEST", "Send a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("BAD_REQUEST", "Missing request body.");
  let text = "";
  const decoder = new TextDecoder();
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 32_768) { await reader.cancel(); throw new ApiError("BAD_REQUEST", "Request is too large."); }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid JSON object");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("BAD_REQUEST", "Send a valid JSON object.");
  } finally { reader.releaseLock(); }
}

function string(value: unknown, max = 200) {
  if (typeof value !== "string" || value.length > max) throw new ApiError("BAD_REQUEST", "Invalid text field.");
  return value;
}

function integer(value: unknown, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) throw new ApiError("BAD_REQUEST", "Invalid study time.");
  return value;
}

async function dispatch(request: Request, segments: string[]) {
  const path = segments.join("/");
  if (path === "session" && request.method === "POST") {
    const key = mobileHash((request.headers.get("x-forwarded-for") ?? "local").slice(0, 100));
    if (!checkRateLimit("MUTATION", `mobile-exchange:${key}`)) throw new ApiError("RATE_LIMITED", "Please try again in a minute.");
    const input = await body(request);
    return Response.json(input.development === true ? await createDevelopmentMobileSession() : await exchangeMobileGrant(string(input.code), string(input.verifier)), { status: 201 });
  }
  const { userId, sessionToken } = await mobileIdentity(request);
  if (path === "session" && request.method === "DELETE") {
    await prisma.session.deleteMany({ where: { sessionToken, userId } });
    return Response.json({ ok: true });
  }
  if (path === "today" && request.method === "GET") return Response.json(await mobileToday(userId));
  if (segments[0] === "materials" && segments.length === 2 && request.method === "GET") return materialResponse(await readMaterial(userId, segments[1]));
  if (segments[0] !== "blocks" || !segments[1] || segments[1].length > 200) throw new ApiError("NOT_FOUND", "Endpoint not found.");
  const blockId = segments[1];
  if (segments.length === 2 && request.method === "GET") return Response.json(await mobileFocus(userId, blockId));
  if (!checkRateLimit("MUTATION", userId)) throw new ApiError("RATE_LIMITED", "Please try again in a minute.");
  const input = await body(request);
  const topicId = string(input.topicId);
  const response = string(input.response, 4000);
  if (segments.length === 3 && segments[2] === "progress" && request.method === "PUT") {
    return Response.json(await mobileSaveProgress(userId, blockId, { topicId, response, elapsedSeconds: integer(input.elapsedSeconds, 36000), updatedAt: string(input.updatedAt) }));
  }
  if (segments.length === 3 && segments[2] === "result" && request.method === "POST") {
    if (typeof input.checked !== "boolean" || !["complete", "practice"].includes(String(input.outcome))) throw new ApiError("BAD_REQUEST", "Check your session outcome.");
    return Response.json(await mobileFinish(userId, blockId, { topicId, response, checked: input.checked, outcome: input.outcome as "complete" | "practice", actualMinutes: integer(input.actualMinutes, 600) }));
  }
  throw new ApiError("NOT_FOUND", "Endpoint not found.");
}

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  let response: Response;
  try { response = await dispatch(request, (await context.params).path); }
  catch (error) { response = handleApiError(error); }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Authorization");
  return response;
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
