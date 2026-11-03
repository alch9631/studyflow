import { View, type StyleProp, type ViewStyle } from "react-native";
import { useAppearance, useTheme } from "./theme";

export function GlassSurface({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; interactive?: boolean }) {
  const theme = useTheme();
  const { reduceTransparency } = useAppearance();
  const glass = theme.dark && !reduceTransparency;
  const material: ViewStyle & { backdropFilter?: string; backgroundImage?: string } = glass ? {
    backgroundColor: "rgba(18, 18, 21, 0.84)",
    backdropFilter: "blur(24px) saturate(120%)",
    backgroundImage: "linear-gradient(145deg, rgba(255,255,255,0.065), rgba(255,255,255,0) 55%)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.2)",
  } : { backgroundColor: theme.surface };
  return <View style={[{ borderRadius: 16, borderWidth: 1, borderColor: theme.line }, material, style]}>{children}</View>;
}
