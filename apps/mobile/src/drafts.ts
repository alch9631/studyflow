import AsyncStorage from "@react-native-async-storage/async-storage";
import { restoreFocusClock, type FocusClock } from "../../../shared/focus-clock";

export type Draft = { response: string; elapsedSeconds: number; updatedAt: string; checked: boolean; sessionMinutes?: number; clock?: FocusClock };
export function draftKey(server: string, userId: string, topicId: string) { return `studyflow:draft:${server}:${userId}:${topicId}`; }
export async function readDraft(key: string): Promise<Draft | null> {
  try {
    const value = JSON.parse(await AsyncStorage.getItem(key) ?? "null");
    return typeof value?.response === "string" && value.response.length <= 4000 && Number.isInteger(value.elapsedSeconds) && value.elapsedSeconds >= 0 && value.elapsedSeconds <= 36000 &&
      typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) ? { ...value, checked: value.checked === true,
        sessionMinutes: Number.isInteger(value.sessionMinutes) && value.sessionMinutes >= 1 && value.sessionMinutes <= 600 ? value.sessionMinutes : undefined,
        clock: restoreFocusClock(JSON.stringify(value.clock ?? null), Date.now()) ?? undefined } : null;
  } catch { return null; }
}
export const writeDraft = (key: string, draft: Draft) => AsyncStorage.setItem(key, JSON.stringify(draft));
export const clearDraft = (key: string) => AsyncStorage.removeItem(key);
export async function clearSessionDrafts(server: string, userId: string) {
  const prefix = `studyflow:draft:${server}:${userId}:`;
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(prefix));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
