import { StyleSheet, View } from "react-native";
import { useTheme } from "./theme";

export default function ThemeTabBar() {
  const theme = useTheme();
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? theme.background : theme.surface }]} />;
}
