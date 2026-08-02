#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/browser-service"
bun run src/index.ts &
BROWSER_SERVICE_PID=$!

cleanup() {
  kill "$BROWSER_SERVICE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$ROOT_DIR"
bun run start:bun
