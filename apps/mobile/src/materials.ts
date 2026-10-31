import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

type Session = { server: string; token: string };
export async function pickAndUpload(session: Session, courseId: string, category = "") {
  const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (picked.canceled) return false;
  const asset = picked.assets[0];
  if ((asset.size ?? new File(asset.uri).size) > 20 * 1024 * 1024) throw new Error("Choose a file smaller than 20 MB.");
  const body = new FormData(); body.append("courseId", courseId);
  if (category) body.append("docType", category);
  body.append("file", { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream" } as unknown as Blob);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${session.server}/api/mobile/actions/uploadMaterial`, { method: "POST", headers: { Authorization: `Bearer ${session.token}` }, body, signal: controller.signal, credentials: "omit" });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message ?? "Couldn't upload this file.");
    return true;
  } finally { clearTimeout(timeout); }
}
export async function openMaterial(session: Session, id: string, filename: string) {
  const destination = new File(Paths.cache, `studyflow-${id}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  const file = await File.downloadFileAsync(`${session.server}/api/mobile/materials/${encodeURIComponent(id)}`, destination,
    { headers: { Authorization: `Bearer ${session.token}` }, idempotent: true });
  try { await Sharing.shareAsync(file.uri, { dialogTitle: filename }); }
  finally { if (file.exists) file.delete(); }
}
