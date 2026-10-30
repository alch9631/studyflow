import type { ExpoConfig } from "expo/config";

const developmentNetwork = process.env.STUDYFLOW_DEV_NETWORK === "1";
const config: ExpoConfig = {
  name: "Studyflow",
  slug: "studyflow-mobile",
  version: "0.1.0",
  icon: "../../public/icon-512.png",
  scheme: "studyflow",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "app.studyflow.mobile",
    supportsTablet: false,
    buildNumber: process.env.IOS_BUILD_NUMBER ?? "1",
    appleTeamId: process.env.APPLE_TEAM_ID,
    config: { usesNonExemptEncryption: false },
    infoPlist: developmentNetwork ? {
      NSLocalNetworkUsageDescription: "Connect to your Studyflow development server.",
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
    } : {},
  },
  plugins: ["expo-router", "expo-secure-store", "expo-web-browser"],
};
export default config;
