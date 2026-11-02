import { router } from "expo-router";
import { ActionMenu } from "./action-menu";

export default function NavigationMenu() {
  return <ActionMenu label="App menu" icon="grid-outline" items={[
    { id: "exams", title: "Exams", image: "graduationcap", onPress: () => router.push("/(tabs)/exams") },
    { id: "insights", title: "Insights", image: "chart.bar", onPress: () => router.push("/insights") },
    { id: "timetable", title: "Timetable", image: "calendar", onPress: () => router.push("/timetable") },
    { id: "settings", title: "Settings & account", image: "gearshape", onPress: () => router.push("/(tabs)/settings") },
  ]} />;
}
