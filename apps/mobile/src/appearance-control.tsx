import SegmentedControl from "@expo/ui/community/segmented-control";
import type { AppearanceMode } from "./theme";

export type AppearanceControlProps = {
  mode: AppearanceMode;
  disabled: boolean;
  onChange: (mode: AppearanceMode) => void;
};

export default function AppearanceControl({ mode, disabled, onChange }: AppearanceControlProps) {
  return <SegmentedControl values={["Light", "Dark"]} selectedIndex={mode === "dark" ? 1 : 0} enabled={!disabled}
    appearance={mode} accessibilityLabel="Appearance" testID="appearance-mode"
    style={{ flexGrow: 1, flexBasis: 160, height: 44 }}
    onChange={({ nativeEvent }) => onChange(nativeEvent.selectedSegmentIndex === 1 ? "dark" : "light")} />;
}
