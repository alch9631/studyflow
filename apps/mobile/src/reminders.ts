import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

const key = (userId: string) => `studyflow.reminder.${userId}`;
export async function reminderEnabled(userId: string) { return (await AsyncStorage.getItem(key(userId))) === "1"; }
export async function setReminder(userId: string, enabled: boolean, minuteOfDay: number) {
  if (enabled) {
    const permissions = await Notifications.requestPermissionsAsync();
    if (permissions.status !== "granted") throw new Error("Allow Studyflow notifications in iPhone Settings to enable reminders.");
  }
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (enabled) await Notifications.scheduleNotificationAsync({ content: { title: "Time for Studyflow", body: "Open your plan and choose a study session." }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 } });
  await AsyncStorage.setItem(key(userId), enabled ? "1" : "0");
}
