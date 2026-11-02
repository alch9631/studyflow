import { StyleSheet } from "react-native";
import { GlassSurface } from "./glass-surface";

export default function ThemeTabBar() {
  return <GlassSurface style={[StyleSheet.absoluteFill, { borderRadius: 0, borderWidth: 0 }]} />;
}
