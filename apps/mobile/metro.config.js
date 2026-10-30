const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
// The backend and native app share plain TypeScript JSON contracts.
config.watchFolders = [path.resolve(__dirname, "../..")];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules"), path.resolve(__dirname, "../../node_modules")];
module.exports = config;
