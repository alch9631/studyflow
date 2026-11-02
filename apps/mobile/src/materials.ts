import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { uploadBatch } from "../../../shared/upload-batch";

type Session = { server: string; token: string };
export type MaterialSelection = { asset: DocumentPicker.DocumentPickerAsset; category: string };
export type MaterialUploadFailure = { item: MaterialSelection; message: string };
export async function pickAndUpload(session: Session, courseId: string, category = "", onProgress = (_current: number, _total: number) => {}) {
  const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
  if (picked.canceled) return null;
  return uploadMaterials(session, courseId, picked.assets.map(asset => ({ asset, category })), onProgress);
}
export function uploadMaterials(session: Session, courseId: string, items: readonly MaterialSelection[], onProgress: (current: number, total: number) => void) {
  return uploadBatch(items, item => uploadOriginal(session, courseId, item), onProgress);
}
async function uploadOriginal(session: Session, courseId: string, { asset, category }: MaterialSelection) {
  const size = asset.size ?? new File(asset.uri).size;
  if (size <= 0 || size > 20 * 1024 * 1024) throw new Error("Choose a non-empty file of 20 MB or smaller.");
  const body = new FormData(); body.append("courseId", courseId);
  if (category) body.append("docType", category);
  body.append("file", { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream" } as unknown as Blob);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${session.server}/api/mobile/actions/uploadMaterial`, { method: "POST", headers: { Authorization: `Bearer ${session.token}` }, body, signal: controller.signal, credentials: "omit" });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message ?? "Couldn't upload this file.");
  } finally { clearTimeout(timeout); }
}
export async function openMaterial(session: Session, id: string, filename: string) {
  // Keep the original extension from Content-Disposition so iOS opens the right viewer.
  const destination = new Directory(Paths.cache, `studyflow-${id}`);
  destination.create({ idempotent: true });
  const file = await File.downloadFileAsync(`${session.server}/api/mobile/materials/${encodeURIComponent(id)}`, destination,
    { headers: { Authorization: `Bearer ${session.token}` }, idempotent: true });
  try { await Sharing.shareAsync(file.uri, { dialogTitle: filename }); }
  finally { if (file.exists) file.delete(); }
}
