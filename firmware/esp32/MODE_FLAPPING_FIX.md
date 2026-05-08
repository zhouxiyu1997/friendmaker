# Switch Lite BT HID Connection Instability — RCA and Fix Log

## Platform

- Device: Switch Lite (built-in non-detachable controller)
- ESP32: ESP32-D0WDQ6 rev v1.0, ESP-IDF 4.4.7, Bluedroid stack
- Firmware: PlatformIO, `esp32dev_wireless` environment

## Confirmed Root Causes

### 1. Premature 0x30 report flooding during subcmd handshake (FIXED)

**Symptom**: `INFO bt hid event=close status=0 conn=2` immediately after `reply02`, looping forever.

**Cause**: Idle send task sent 0x30 reports from `OPEN_EVT`. Switch Lite closes HID if unsolicited 0x30 reports arrive before subcmd 0x03 sets input report mode.

**Fix**: Gate send task on `paired_`. Remove `sendCurrentInputReport` from `OPEN_EVT`.

### 2. Wrong MAC in subcmd 0x02 reply (FIXED)

**Symptom**: Switch Lite closes HID after `reply02` even with correct timing.

**Cause**: `kReply02` bytes 18–23 hardcoded to wrong MAC. Switch Lite validates against advertising MAC.

**Fix**: Fill bytes 18–23 at reply time from `esp_bt_dev_get_address()`.

**Side effect**: Switch now shows the standard "pair succeeded, press L+R" dialog on first pairing. This is correct — the pairing was silently failing before. Send `LR` to confirm.

### 3. SEND_REPORT_EVT flood blocking serial output (FIXED)

**Symptom**: Hundreds of `WARN bt hid event=send-report status=1 reason=8` per second blocking serial command output.

**Cause**: Idle send task at 15 ms fires into a congested L2CAP channel; every failure logged unconditionally.

**Fix**: Suppress congestion-only failures (reason=8 / reason=0) in `SEND_REPORT_EVT` handler. Explicit button-press failures still logged via `waitForInputReportAccepted`.

### 4. ACL TX credit stall after sniff-mode LMP collision (ACTIVE — partial mitigation)

**Symptom**: After the first successful button press, all subsequent button commands return `OK` from the serial side but are silently not received by the Switch. No disconnect, no errors. Buttons resume working only after reconnect.

**Root cause**: After pairing completes, BTA_DM_PM requests sniff mode (intv 10–18 slots). If the Switch Lite simultaneously sends its own sniff LMP, two competing transactions collide:
```
hci cmd send: sniff: hdl 0x80, intv(10 18)       ← BTA_DM_PM
hcif mode change: hdl 0x80, mode 0, status 0x23  ← BTM_ERR_PROCESSING
hcif mode change: hdl 0x80, mode 2, intv 8 0x0   ← Switch's sniff wins
hcif mode change: hdl 0x80, mode 2, intv 0 0x1f  ← BTA_DM_PM retry fails
```
After this collision the ESP32 BT controller stops sending `num_completed_pkts` HCI events, so L2CAP's TX credit counter sticks at 0. `esp_bt_hid_device_send_report` returns `ESP_OK` (packet accepted into xmit_hold_q) but `SEND_REPORT_EVT` fires with reason=8 because the credit never refills. The packet never transmits over-the-air.

**Mitigation applied**:
- `esp_bt_sleep_disable()` at Bluedroid init — keeps RF clock on, reduces LMP timing jitter and shrinks the collision window.
- ACL stall detector in send task: if no `SEND_REPORT_EVT` succeeds for 800 ms while connected+paired, call `esp_bt_hid_device_disconnect()` (not full stack restart).
- Deferred reconnect: CLOSE_EVT sets `pendingReconnectAfterMs_ = millis() + 500`; send task calls `attemptVirtualCablePlug` after the delay so the HID stack is fully settled (avoids `busy status:5`).

**Removed**: `esp_bt_gap_set_qos(peer, 8)` at OPEN_EVT. This was added to influence sniff interval but it raced with BTA_DM_PM's own sniff request and made the LMP collision worse.

**Status**: Stall is detected and recovered in ~1.3 s. The Switch does not show a "disconnected" screen because the ACL link stays up. Full prevention requires either patching BTA_DM_PM (closed source) or disabling PM for the HID profile, which is not exposed in ESP-IDF 4.4.7's public API.

### 5. ASSERT_WARN(51 9) in lc_task.c — Bluedroid 4.4.7 firmware bug

**Cause**: ATTE2 LMP response arrives ~1 s post-connection while sniff LMP is in flight. Closed-source `libbt.a` LC state machine hits assertion at lc_task.c:1409. Unfixable from app code.

**Status**: Still fires, but does not block operation. Connection recovers automatically.

### 6. Mode 0/2 flapping

**Cause**: Normal Bluedroid PM behavior. Cosmetic, not blocking.

## Changes Applied (Cumulative, Current State)

| File | Change |
|------|--------|
| `classic_bt_controller_transport.cpp` | Send task gated on `paired_` |
| `classic_bt_controller_transport.cpp` | Removed `sendCurrentInputReport(false)` from `OPEN_EVT` |
| `classic_bt_controller_transport.cpp` | `kReply02` MAC bytes filled dynamically from `esp_bt_dev_get_address()` |
| `classic_bt_controller_transport.cpp` | Removed `esp_bt_gap_set_qos` from `OPEN_EVT` (caused LMP collision) |
| `classic_bt_controller_transport.cpp` | `esp_bt_sleep_disable()` at Bluedroid init |
| `classic_bt_controller_transport.cpp` | `SEND_REPORT_EVT` congestion noise suppressed (reason=8/0) |
| `classic_bt_controller_transport.cpp` | ACL stall detector in send task (800 ms timeout → HID disconnect) |
| `classic_bt_controller_transport.cpp` | Deferred reconnect via `pendingReconnectAfterMs_` (500 ms after close) |
| `classic_bt_controller_transport.cpp` | `lastSuccessfulSendMs_` tracked in `SEND_REPORT_EVT` |
| `classic_bt_controller_transport.cpp` | Keepalive log suppression (report=16 len=9) |
| `classic_bt_controller_transport.h` | `lastSuccessfulSendMs_`, `pendingReconnectAfterMs_` fields added |
| `controller.h` / `controller.cpp` | `isPaused()` added |
| `protocol.cpp` | Paused-state fail-fast guard added |
| `main.cpp` | Raw command + `OK dry-run no-bt` mode |

## Expected Log Pattern (After All Fixes)

```
INFO bt hid event=open status=0 conn=0 peer=...
INFO bt intr report=1 len=48 subcmd=2 ...        ← device info
INFO bt reply label=reply02 ...
INFO bt intr report=1 len=48 subcmd=8 ...
... (SPI reads) ...
INFO bt intr report=1 len=48 subcmd=3 ...        ← set input report mode
INFO bt intr report=1 len=48 subcmd=48 ...       ← set player lights → paired_=true
                                                  ← idle send task starts
ECHO raw command="A"
INFO action=button name=A
OK
... (sniff collision fires ~800 ms later) ...
INFO bt acl-stall detected, disconnecting hid
INFO bt reconnectable reason=hid-close ...
INFO bt hid event=close status=0 conn=3
INFO bt virtual-cable reason=stall-reconnect peer=...  ← 500 ms after close
INFO bt hid event=open status=0 conn=0 peer=...       ← reconnected
... (handshake repeats) ...
ECHO raw command="B"
INFO action=button name=B
OK                                                     ← working again
```

## Known Remaining Issues

1. **ACL stall on first button after pairing** — sniff LMP collision is inherent to Bluedroid 4.4.7 PM behavior. `esp_bt_sleep_disable()` reduces frequency but cannot prevent it entirely. The 800 ms stall detector and auto-reconnect recover it without user intervention.
2. **ASSERT_WARN(51 9)** — unfixable, cosmetic.

## Files Touched

- `src/classic_bt_controller_transport.cpp`
- `src/classic_bt_controller_transport.h`
- `src/protocol.cpp`
- `src/controller.h`
- `src/controller.cpp`
- `src/main.cpp`
