import type { MobileBlock, MobileProgressInput, MobileResultInput, MobileSession, MobileToday } from "../../../shared/mobile";

export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

export function serverUrl(input: string, development: boolean): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("Enter your Studyflow server address."); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    !(url.protocol === "https:" || development && url.protocol === "http:")) {
    throw new Error(development ? "Use the server's http:// or https:// address without a path." : "Studyflow requires a secure https:// server.");
  }
  return url.origin;
}

export async function api<T>(base: string, token: string | null, path: string, options?: { method?: string; body?: unknown; timeout?: number }): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeout ?? 20_000);
  try {
    const response = await fetch(`${base}/api/mobile/${path}`, {
      method: options?.method ?? "GET",
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: options?.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      credentials: "omit",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(data?.error?.message ?? "Studyflow couldn't complete that request.", response.status);
    if (data === null) throw new ApiError("The server returned an unexpected response.");
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Couldn't reach Studyflow. Check your connection and try again.");
  } finally { clearTimeout(timeout); }
}

export const getToday = (base: string, token: string) => api<MobileToday>(base, token, "today");
export const getFocus = (base: string, token: string, id: string) => api<MobileBlock>(base, token, `blocks/${encodeURIComponent(id)}`);
export const saveProgress = (base: string, token: string, id: string, body: MobileProgressInput) => api<{ ok: true }>(base, token, `blocks/${encodeURIComponent(id)}/progress`, { method: "PUT", body });
export const finishSession = (base: string, token: string, id: string, body: MobileResultInput) => api<{ ok: true }>(base, token, `blocks/${encodeURIComponent(id)}/result`, { method: "POST", body });
export const exchangeSession = (base: string, body: unknown) => api<MobileSession>(base, null, "session", { method: "POST", body });
