#!/usr/bin/env bash
# Manual/controller entry point; shares the automatic deployer's lock and CI gate.
set -euo pipefail
runner="$HOME/.local/share/studyflow-deploy/autodeploy.py"
config="$HOME/.config/studyflow-deploy/config.json"
if [[ ! -f "$runner" || ! -f "$config" ]]; then
  echo "Install first: python3 ops/install_autodeploy.py" >&2
  exit 1
fi
exec /usr/bin/python3 "$runner" --config "$config" --retry
