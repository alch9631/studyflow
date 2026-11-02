import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Appearance, Platform, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "expo-router/react-navigation";

export type AppearanceMode = "light" | "dark";
export const APPEARANCE_KEY = "studyflow.mobile.appearance.v1";

// Keep surface colours neutral; the existing accent still identifies actions.
const palettes = {
  light: {
    dark: false, background: "#F4F4F5", surface: "#FFFFFF", text: "#18181B",
    muted: "#606068", line: "#D4D4D8", brand: "#126C60", tint: "#EDEDEF", danger: "#A6312D",
  },
  dark: {
    dark: true, background: "#000000", surface: "#151517", text: "#F5F5F7",
    muted: "#ACACB4", line: "#3C3C42", brand: "#67D7C4", tint: "#242427", danger: "#FFB4AB",
  },
} as const;

type AppTheme = (typeof palettes)[AppearanceMode];
type AppearanceState = {
  mode: AppearanceMode;
  reduceTransparency: boolean;
  setMode: (mode: AppearanceMode) => Promise<void>;
};

const ThemeContext = createContext<AppTheme>(palettes.light);
const AppearanceContext = createContext<AppearanceState | null>(null);

function applyNativeMode(mode: AppearanceMode) {
  if (Platform.OS !== "web") Appearance.setColorScheme(mode);
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemMode = useColorScheme();
  // Until a choice is saved, use the device's appearance.
  const [savedMode, setSavedMode] = useState<AppearanceMode | null>(null);
  const [ready, setReady] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(Platform.OS === "ios");
  const mode = savedMode ?? (systemMode === "dark" ? "dark" : "light");
  const theme = palettes[mode];

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(APPEARANCE_KEY).then(value => {
      if (active && (value === "light" || value === "dark")) {
        applyNativeMode(value);
        setSavedMode(value);
      }
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" && typeof window.matchMedia === "function") {
      const preference = window.matchMedia("(prefers-reduced-transparency: reduce)");
      const update = () => setReduceTransparency(preference.matches);
      update();
      preference.addEventListener("change", update);
      return () => preference.removeEventListener("change", update);
    }
    if (Platform.OS !== "ios") return;
    let active = true;
    // Subscribe before reading so an accessibility change cannot be missed.
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", value => {
      if (active) setReduceTransparency(value);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (active) setReduceTransparency(value);
    }).catch(() => {});
    return () => { active = false; subscription.remove(); };
  }, []);

  const setMode = useCallback(async (next: AppearanceMode) => {
    // Apply only after saving succeeds; a failed save leaves the last choice intact.
    await AsyncStorage.setItem(APPEARANCE_KEY, next);
    applyNativeMode(next);
    setSavedMode(next);
  }, []);

  const appearance = useMemo(() => ({ mode, reduceTransparency, setMode }), [mode, reduceTransparency, setMode]);
  const navigationTheme = useMemo(() => ({
    ...(theme.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.dark ? DarkTheme : DefaultTheme).colors,
      primary: theme.brand, background: theme.background, card: theme.surface,
      text: theme.text, border: theme.line, notification: theme.danger,
    },
  }), [theme]);

  return <ThemeContext value={theme}><AppearanceContext value={appearance}>
    <NavigationThemeProvider value={navigationTheme}>{ready ? children : null}</NavigationThemeProvider>
  </AppearanceContext></ThemeContext>;
}

export function useTheme() { return use(ThemeContext); }

export function useAppearance() {
  const appearance = use(AppearanceContext);
  if (!appearance) throw new Error("AppThemeProvider is missing.");
  return appearance;
}
