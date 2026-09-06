#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
errors=()

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun no está instalado. Instálalo desde https://bun.sh" >&2
  exit 1
fi

if ! (cd "$ROOT_DIR" && bun install >/dev/null); then
  errors+=("No se pudieron instalar las dependencias del proyecto raíz (bun install falló).")
fi

if ! (cd "$ROOT_DIR/browser-service" && bun install >/dev/null); then
  errors+=("No se pudieron instalar las dependencias de browser-service (bun install falló).")
fi

if [ ! -f "$ROOT_DIR/.env" ]; then
  errors+=("Falta el archivo .env en la raíz. Copia .env.example a .env y configura tu proveedor de IA.")
fi

playwright_cache="${PLAYWRIGHT_BROWSERS_PATH:-}"
if [ -z "$playwright_cache" ]; then
  case "$(uname -s)" in
    Darwin) playwright_cache="$HOME/Library/Caches/ms-playwright" ;;
    *) playwright_cache="$HOME/.cache/ms-playwright" ;;
  esac
fi
if ! ls "$playwright_cache"/chromium-* >/dev/null 2>&1; then
  errors+=("Falta el navegador Chromium de Playwright. Ejecuta: cd browser-service && bunx playwright install chromium")
fi

if [ "${#errors[@]}" -gt 0 ]; then
  echo "No se puede arrancar, faltan prerrequisitos:" >&2
  for e in "${errors[@]}"; do
    echo "  - $e" >&2
  done
  exit 1
fi

cd "$ROOT_DIR/browser-service"
bun run src/index.ts &
BROWSER_SERVICE_PID=$!

cleanup() {
  kill "$BROWSER_SERVICE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$ROOT_DIR"
bun run start:bun
