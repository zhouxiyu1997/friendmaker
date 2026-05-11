
# Switch Lite Bluetooth HID Connection Stability: Minimal Fixes

## Summary
This document summarizes the code changes required to ensure stable Bluetooth HID pairing and operation with Nintendo Switch Lite, while keeping one codebase that can build both standard Switch and Switch Lite firmware variants.

## Key Fixes

- **Compile-time model selection (`SWITCH_LITE`)**: Switch Lite-specific behavior is now behind compile-time guards so the same firmware source supports both models. Standard builds keep baseline behavior; Switch Lite builds enable the stability workarounds.

- **Disable BT modem sleep at runtime**: `esp_bt_sleep_disable()` is called in `initializeClassicBluetooth()` to prevent the ESP32 from entering sniff mode, which causes LMP collisions and pairing instability on Switch Lite.

- **Fixed send interval for input reports**: The send task uses a fixed 100ms interval (see `sendTaskTrampoline`) instead of dynamic timing. This avoids timing races and LMP collisions during pairing and normal operation.

- **Initial delay after HID open**: A 1000ms delay is used at the start of the send task to allow Switch Lite encryption to complete before sending reports, improving pairing reliability.

- **Extended congestion retry budget**: HID congestion retry budget is increased to 300ms so brief L2CAP congestion windows on Switch Lite do not prematurely fail button sends.

- **Drain in-flight send-report events before explicit input**: Before explicit input retries, the code waits briefly for queued idle-send callbacks to drain and re-aligns send counters. This prevents stale idle events from being misattributed to explicit button sends.

- **Mark paired state on handshake reply path**: On the input report path that handles subcommand `0x03`, `markControllerPaired()` is called to ensure send task/report readiness state is synchronized once the link is live.

- **Suppress routine congestion warning spam**: In `ESP_HIDD_SEND_REPORT_EVT`, expected congestion outcomes (reason `8` and `0`) are filtered from warning logs to reduce noise while preserving non-routine failure visibility.

## Build Configuration

- **PlatformIO shared base env**: `esp32dev_wireless_base` defines common board/framework settings and common build flags.
- **PlatformIO standard build**: Environment `esp32dev_wireless` extends the base env and builds without `SWITCH_LITE`.
- **PlatformIO Switch Lite build**: Environment `esp32dev_wireless_switch_lite` extends the base env and adds `-DSWITCH_LITE=1`.
- **CMake support**: Top-level option `SWITCH_LITE` is available and forwarded to source compile definitions.

This inheritance setup minimizes duplication and config drift while keeping the model-specific behavior isolated to one macro flag.

## UI Integration: How To Call Build Modes

Use the selected console model to choose the build target:

- `switch` -> PlatformIO env: `esp32dev_wireless`
- `switch_lite` -> PlatformIO env: `esp32dev_wireless_switch_lite`

Recommended UI call flow (PlatformIO):

1. Build
	- Standard Switch: `pio run -e esp32dev_wireless`
	- Switch Lite: `pio run -e esp32dev_wireless_switch_lite`
2. Flash
	- Standard Switch: `pio run -e esp32dev_wireless -t upload`
	- Switch Lite: `pio run -e esp32dev_wireless_switch_lite -t upload`
3. Monitor (optional)
	- `pio device monitor -b 115200`

If your UI needs one command per mode, use:

- Standard Switch build+flash: `pio run -e esp32dev_wireless -t upload`
- Switch Lite build+flash: `pio run -e esp32dev_wireless_switch_lite -t upload`

CMake equivalent (if not using PlatformIO):

- Standard: configure without `SWITCH_LITE` (default `OFF`)
- Switch Lite: configure with `-DSWITCH_LITE=ON`

Example CMake configure call for Switch Lite:

- `cmake -S . -B build-switch-lite -DSWITCH_LITE=ON`

## Compatibility

- **Switch Lite**: Stable pairing and operation, no repeated notifications, no LMP collision disconnects.
- **Regular Switch**: Remains compatible, no regressions observed.

## Technical Rationale

Switch Lite is more sensitive to timing and power management than the regular Switch. Disabling modem sleep and using a fixed, conservative send interval prevents sniff mode transitions and LMP collisions, which are the root cause of pairing instability. The initial delay ensures encryption is established before input reports are sent. The congestion retry/draintime changes improve reliability when send callbacks are delayed or reordered during transient channel pressure. Using compile-time guards keeps standard firmware behavior unchanged while enabling these mitigations only for Switch Lite builds.

## Files Modified

- **Issue-specific logic**: `src/classic_bt_controller_transport.cpp` contains the Switch Lite stability fixes and `SWITCH_LITE` guards.
- **Build selection**: `platformio.ini` defines standard and Switch Lite environments.
- **CMake build path**: `CMakeLists.txt` and `src/CMakeLists.txt` add `SWITCH_LITE` option/definition support.
- **Additional branch changes vs main**: `src/main.cpp`, `.gitignore`, and `.vscode/extensions.json` also differ from main but are not core to the Switch Lite BT stability fix itself.
