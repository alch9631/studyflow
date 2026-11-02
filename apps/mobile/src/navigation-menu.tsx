import { router } from "expo-router";
import { ActionMenu } from "./action-menu";

export default function NavigationMenu() {
  return <ActionMenu label="App menu" icon="grid-outline" items={[
    { id: "exams", title: "Exams", image: "graduationcap", onPress: () => router.push("/exams") },
    { id: "insights", title: "Insights", image: "chart.bar", onPress: () => router.push("/insights") },
    { id: "settings", title: "Settings", image: "gearshape", onPress: () => router.push("/settings") },
  ]} />;
}
