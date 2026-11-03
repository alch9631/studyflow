import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Appearance, Platform, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "expo-router/react-navigation";
import { ACCENT_KEY, normalizeAccent, readableAccent, textOnAccent } from "./theme-colors";

export type AppearanceMode = "light" | "dark";
export const APPEARANCE_KEY = "studyflow.mobile.appearance.v1";

// Keep surface colours neutral; the existing accent still identifies actions.
const palettes = {
  light: {
    dark: false, background: "#FAFAF8", surface: "#FFFFFF", text: "#18181B",
    muted: "#606068", line: "#E2E2DE", brand: "#126C60", tint: "#F0F0ED", danger: "#A6312D",
  },
  dark: {
    dark: true, background: "#000000", surface: "#151517", text: "#F5F5F7",
    muted: "#ACACB4", line: "#3C3C42", brand: "#67D7C4", tint: "#242427", danger: "#FFB4AB",
  },
} as const;

type AppTheme = { dark: boolean; background: string; surface: string; text: string; muted: string; line: string; brand: string; accent: string; onAccent: string; tint: string; danger: string };
type AppearanceState = {
  mode: AppearanceMode;
  accent: string | null;
  reduceTransparency: boolean;
  setMode: (mode: AppearanceMode) => Promise<void>;
  setAccent: (color: string | null) => Promise<void>;
};

const ThemeContext = createContext<AppTheme>({ ...palettes.light, accent: palettes.light.brand, onAccent: "#FFFFFF" });
const AppearanceContext = createContext<AppearanceState | null>(null);

function applyNativeMode(mode: AppearanceMode) {
  if (Platform.OS !== "web") Appearance.setColorScheme(mode);
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemMode = useColorScheme();
  // Until a choice is saved, use the device's appearance.
  const [savedMode, setSavedMode] = useState<AppearanceMode | null>(null);
  const [accent, setSavedAccent] = useState<string | null>(null);
  const accentWrite = useRef(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(Platform.OS === "ios");
  const mode = savedMode ?? (systemMode === "dark" ? "dark" : "light");
  const theme = useMemo(() => {
    const palette = palettes[mode];
    const fill = accent ?? palette.brand;
    return { ...palette, accent: fill, onAccent: textOnAccent(fill), brand: readableAccent(fill, palette.background) };
  }, [mode, accent]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.multiGet([APPEARANCE_KEY, ACCENT_KEY]).then(values => {
      if (!active) return;
      const value = values[0][1];
      if (value === "light" || value === "dark") {
        applyNativeMode(value); setSavedMode(value);
      }
      setSavedAccent(normalizeAccent(values[1][1]));
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

  const setAccent = useCallback((value: string | null) => {
    const next = normalizeAccent(value);
    if (value !== null && !next) return Promise.reject(new Error("Choose a valid color."));
    setSavedAccent(next);
    // Update immediately and serialize saves so the final picker event wins.
    const write = accentWrite.current.catch(() => {}).then(() => next
      ? AsyncStorage.setItem(ACCENT_KEY, next) : AsyncStorage.removeItem(ACCENT_KEY));
    accentWrite.current = write;
    return write;
  }, []);

  const appearance = useMemo(() => ({ mode, accent, reduceTransparency, setMode, setAccent }), [mode, accent, reduceTransparency, setMode, setAccent]);
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
