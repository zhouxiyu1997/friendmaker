# Mode 0/2 Flapping and Pairing Instability Summary

## Current Situation

The ESP32 Classic BT HID transport still shows an unstable connection loop during pairing and first input:

- Rapid mode churn in logs (`mode=2` then `mode=0` repeatedly)
- Frequent `hid-close` followed by reconnect
- `L2CAP - no CCB for L2CA_DataWrite` warnings
- `send-report status=1 reason=8` (congestion / rejected report)
- Sometimes long delay before device appears on Switch pairing screen
- Sometimes board does not appear reliably

## Root Cause (Working Theory)

The failures are caused by timing and state races during the early HID handshake window:

1. HID open/auth is not fully stable yet (`open status=0 conn=0` appears repeatedly)
2. Input/report traffic starts too early or at the wrong cadence
3. GAP scan-mode transitions happen near the same window, amplifying sniff/unsniff churn
4. Result: host closes link, device re-enters reconnectable state, and loops

## What Was Changed Recently

### Transport and report-flow changes

- Added mutex-based report synchronization (`inputReportSendMutex_`)
- Added send completion counters (`inputReportSubmitCount_`, `inputReportSendEventCount_`)
- Added congestion/backoff handling logic
- Added report tracking reset on pairing confirmation (`markControllerPaired()`)

### Pairing and discoverable path adjustments (iterated)

- Tried delaying NON_CONNECTABLE transition to pairing-confirm stage
- Tried removing OPEN_EVT mode change
- Tried reducing pre-pair report pressure (dummy payload before pairing)
- Restored initial OPEN_EVT report kick (required to avoid handshake stall)

### Command path robustness

- Added paused-state guard in protocol flow:
  - when paused, commands now fail fast with clear error instead of silently hanging
  - resume command (`R`) remains allowed

## Important Regression Fixes Applied

- Fixed corrupted `ESP_HIDD_SEND_REPORT_EVT` branch where failure counters could be incremented incorrectly
- Removed one pairing-stage forced scan-mode call that reintroduced disconnect loops

## Current Known-Problem Indicators in Logs

If you see the following sequence, link stability is not solved yet:

1. `INFO bt hid event=open status=0 conn=0 ...`
2. `INFO bt mode-change mode=2`
3. `INFO bt mode-change mode=0`
4. `INFO bt reconnectable reason=hid-close ...`
5. `INFO bt acl-disconnect reason=275`
6. repeat

## Files Touched in This Debug Cycle

- `src/classic_bt_controller_transport.cpp`
- `src/classic_bt_controller_transport.h`
- `src/protocol.cpp`
- `src/controller.h`
- `src/controller.cpp`

## Build Status

Latest edited code compiles locally with PlatformIO (`pio run` success observed during session).

## Next Step (Planned)

Use one stable baseline for transport behavior and stop mixing pairing-path experiments:

1. Keep OPEN_EVT handshake kick (`ensureSendTask(); sendCurrentInputReport(false);`)
2. Keep send-report event accounting strictly status-based
3. Keep pairing stage free of extra scan-mode toggles
4. Keep reconnectable transition logic centralized in `enterReconnectableState()`
5. Re-test with first button (`A`) immediately after pairing

## Notes

This document is a live incident summary for the current session and reflects what is known now, not a final resolved RCA.
