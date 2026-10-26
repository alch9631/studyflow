import { readMaterialOutline } from "./documentOutline";

/** Increment when the recognition algorithm needs existing files reprocessed. */
export const MATERIAL_RECOGNITION_VERSION = 1;
export type MaterialRecognition = {
  version: number;
  status: "ready" | "no-outline" | "unreadable" | "failed" | "skipped";
  checkedAt: string;
  retryAt?: string;
};

export function readMaterialRecognition(raw: string | null | undefined): MaterialRecognition | null {
  try {
    const r = JSON.parse(raw ?? "null")?.recognition;
    return r && Number.isInteger(r.version) && ["ready", "no-outline", "unreadable", "failed", "skipped"].includes(r.status) &&
      typeof r.checkedAt === "string" && Number.isFinite(Date.parse(r.checkedAt)) &&
      (r.retryAt === undefined || typeof r.retryAt === "string" && Number.isFinite(Date.parse(r.retryAt))) ? r : null;
  } catch { return null; }
}

export function recognitionNeedsRefresh(raw: string | null | undefined, now = Date.now()): boolean {
  const r = readMaterialRecognition(raw);
  return !r || r.version !== MATERIAL_RECOGNITION_VERSION || r.status === "ready" && !readMaterialOutline(raw)
    || r.status === "failed" && (!r.retryAt || Date.parse(r.retryAt) <= now);
}
