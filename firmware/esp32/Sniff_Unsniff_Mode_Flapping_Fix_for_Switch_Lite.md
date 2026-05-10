
# Switch Lite Bluetooth HID Connection Stability: Minimal Fixes

## Summary
This document summarizes the minimal code changes required to ensure stable Bluetooth HID pairing and operation with Nintendo Switch Lite, focusing on connection stability and avoiding unnecessary modifications.

## Key Fixes

- **Disable BT modem sleep at runtime**: `esp_bt_sleep_disable()` is called in `initializeClassicBluetooth()` to prevent the ESP32 from entering sniff mode, which causes LMP collisions and pairing instability on Switch Lite.

- **Fixed send interval for input reports**: The send task uses a fixed 100ms interval (see `sendTaskTrampoline`) instead of dynamic timing. This avoids timing races and LMP collisions during pairing and normal operation.

- **Initial delay after HID open**: A 1000ms delay is used at the start of the send task to allow Switch Lite encryption to complete before sending reports, improving pairing reliability.

- **Extended congestion retry budget**: HID congestion retry budget is increased to 300ms so brief L2CAP congestion windows on Switch Lite do not prematurely fail button sends.

- **Drain in-flight send-report events before explicit input**: Before explicit input retries, the code waits briefly for queued idle-send callbacks to drain and re-aligns send counters. This prevents stale idle events from being misattributed to explicit button sends.

- **Mark paired state on handshake reply path**: On the input report path that handles subcommand `0x03`, `markControllerPaired()` is called to ensure send task/report readiness state is synchronized once the link is live.

- **Suppress routine congestion warning spam**: In `ESP_HIDD_SEND_REPORT_EVT`, expected congestion outcomes (reason `8` and `0`) are filtered from warning logs to reduce noise while preserving non-routine failure visibility.

## Compatibility

- **Switch Lite**: Stable pairing and operation, no repeated notifications, no LMP collision disconnects.
- **Regular Switch**: Remains compatible, no regressions observed.

## Technical Rationale

Switch Lite is more sensitive to timing and power management than the regular Switch. Disabling modem sleep and using a fixed, conservative send interval prevents sniff mode transitions and LMP collisions, which are the root cause of pairing instability. The initial delay ensures encryption is established before input reports are sent. The congestion retry/draintime changes improve reliability when send callbacks are delayed or reordered during transient channel pressure.

## Files Modified

- **Issue-specific logic**: `classic_bt_controller_transport.cpp` contains the Switch Lite stability fixes described above.
- **Additional branch changes vs main**: `main.cpp`, `.gitignore`, and `.vscode/extensions.json` also differ from main but are not core to the Switch Lite BT stability fix itself.
