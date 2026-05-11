#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_FIRMWARE=0

for arg in "$@"; do
  case "$arg" in
    --skip-firmware)
      SKIP_FIRMWARE=1
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: bash scripts/ci-local.sh [--skip-firmware]" >&2
      exit 1
      ;;
  esac
done

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  PYTHON_BIN=""
fi

run_step() {
  echo
  echo "==> $*"
  "$@"
}

cd "$ROOT_DIR"

run_step npm run check
run_step npm run test:desktop
run_step npm run check --prefix site/flasher
run_step npm run test --prefix site/flasher

if [[ "$SKIP_FIRMWARE" -eq 0 ]]; then
  if [[ -z "$PYTHON_BIN" ]]; then
    echo "Python is required to run the firmware checks." >&2
    exit 1
  fi

  if ! "$PYTHON_BIN" -m platformio --version >/dev/null 2>&1; then
    echo "PlatformIO is not installed for $PYTHON_BIN." >&2
    echo "Install it with: $PYTHON_BIN -m pip install platformio" >&2
    exit 1
  fi

  run_step "$PYTHON_BIN" -m platformio run -d firmware/esp32 -e esp32dev_wireless
  run_step "$PYTHON_BIN" -m platformio run -d firmware/esp32 -e esp32dev_wireless_switch2
  run_step "$PYTHON_BIN" -m platformio run -d firmware/esp32 -e esp32dev_wireless_switch_lite

  run_step npm run build --prefix site/flasher
  run_step npm run verify:pages --prefix site/flasher
else
  run_step npm run build:web --prefix site/flasher
fi
