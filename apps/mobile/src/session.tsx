import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import type { MobileSession } from "../../../shared/mobile";
import { api, exchangeSession, serverUrl } from "./api";

WebBrowser.maybeCompleteAuthSession();
const STORAGE_KEY = "studyflow.mobile.session.v1";
type StoredSession = MobileSession & { server: string };
type SessionContext = {
  session: StoredSession | null; loading: boolean; defaultServer: string;
  connect: (server: string, development?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
};
const Context = createContext<SessionContext | null>(null);

function defaultServer() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return __DEV__ ? `http://${host || "localhost"}:3000` : "";
}

async function challenge(value: string) {
  return (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, { encoding: Crypto.CryptoEncoding.BASE64 }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      const saved: StoredSession = JSON.parse(raw);
      if (typeof saved.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(saved.token) && typeof saved.userId === "string" &&
        typeof saved.server === "string" && new Date(saved.expiresAt).getTime() > Date.now()) {
        saved.server = serverUrl(saved.server, __DEV__);
        if (active) setSession(saved);
      }
    }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const connect = useCallback(async (input: string, development = false) => {
    const server = serverUrl(input, __DEV__);
    let credentials: MobileSession;
    if (development && __DEV__) credentials = await exchangeSession(server, { development: true });
    else {
      const verifier = (Crypto.randomUUID() + Crypto.randomUUID()).replace(/-/g, "");
      const state = await challenge(Crypto.randomUUID() + Crypto.randomUUID());
      const redirectUri = Linking.createURL("auth/callback", { scheme: "studyflow" });
      const query = new URLSearchParams({ challenge: await challenge(verifier), state, redirectUri });
      const result = await WebBrowser.openAuthSessionAsync(`${server}/mobile/connect?${query}`, redirectUri);
      if (result.type !== "success") throw new Error("Sign-in was cancelled. You can try again whenever you're ready.");
      const callback = new URL(result.url);
      if (callback.searchParams.get("state") !== state || !callback.searchParams.get("code")) throw new Error("Couldn't verify this sign-in. Please try again.");
      credentials = await exchangeSession(server, { code: callback.searchParams.get("code"), verifier });
    }
    const saved = { ...credentials, server };
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(saved), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    setSession(saved);
  }, []);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
    setSession(null);
    // Local sign-out must work even if a development server moved or is offline.
    // Revoke this device's server token whenever the server is reachable.
    if (session) void api(session.server, session.token, "session", { method: "DELETE" }).catch(() => {});
  }, [session]);
  const value = useMemo(() => ({ session, loading, connect, signOut, defaultServer: defaultServer() }), [session, loading, connect, signOut]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSession() {
  const context = useContext(Context);
  if (!context) throw new Error("SessionProvider is missing.");
  return context;
}
