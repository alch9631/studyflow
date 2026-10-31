import type { ExpoConfig } from "expo/config";

const developmentNetwork = process.env.STUDYFLOW_DEV_NETWORK === "1";
const config: ExpoConfig = {
  name: "Studyflow",
  slug: "studyflow-mobile",
  owner: "mohaboss",
  version: "0.2.0",
  icon: "../../public/icon-512.png",
  scheme: "studyflow",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "app.studyflow.mobile",
    supportsTablet: false,
    buildNumber: process.env.IOS_BUILD_NUMBER ?? "1",
    appleTeamId: process.env.APPLE_TEAM_ID ?? "4K5P6S4BXZ",
    config: { usesNonExemptEncryption: false },
    infoPlist: developmentNetwork ? {
      NSLocalNetworkUsageDescription: "Connect to your Studyflow development server.",
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
    } : {},
  },
  plugins: ["expo-router", "expo-secure-store", "expo-web-browser", "@react-native-community/datetimepicker", "expo-sharing", ["expo-notifications", { enableRemoteNotifications: false }]],
  extra: { eas: { projectId: "a5b0620f-c271-4d13-9e82-fe559bd8a374" } },
};
export default config;
