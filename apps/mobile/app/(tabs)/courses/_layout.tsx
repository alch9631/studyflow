import { Stack } from "expo-router";
import { useTheme } from "../../../src/ui";

export const unstable_settings = { initialRouteName: "index" };

export default function CoursesLayout() {
  const theme = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }} />;
}
