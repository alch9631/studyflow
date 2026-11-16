#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../.."
node_major=$(cat ../../.nvmrc)
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" != "$node_major" ]]; then
  brew install "node@$node_major"
  export PATH="$(brew --prefix "node@$node_major")/bin:$PATH"
fi

export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-$(node -p 'require("./eas.json").build.production.env.EXPO_PUBLIC_API_URL')}"
export EXPO_USE_PRECOMPILED_MODULES=0

npm ci
IOS_BUILD_NUMBER="${CI_BUILD_NUMBER:-${IOS_BUILD_NUMBER:-1}}" \
  ./node_modules/.bin/expo prebuild --platform ios --no-install --no-clean

cd ios
pod install --deployment

# Xcode runs the React Native bundle phase in a separate process.
printf 'export NODE_BINARY=%q\nexport EXPO_PUBLIC_API_URL=%q\n' \
  "$(command -v node)" "$EXPO_PUBLIC_API_URL" > .xcode.env.local
