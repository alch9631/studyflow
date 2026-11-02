import { View } from "react-native";
import { useSession } from "./session";
import { AppText, useTheme } from "./ui";

export default function DemoNotice() {
  const { isDemo } = useSession();
  const theme = useTheme();
  if (!isDemo) return null;
  return <View accessibilityRole="summary" style={{ alignSelf: "flex-start", backgroundColor: theme.tint, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
    <AppText size={12} weight="600">Demo · Sample data</AppText>
  </View>;
}
