# Switch Lite BT HID Connection Stability Fixes

## Problem Statement

The ESP32 firmware exhibited connection instability with Nintendo Switch Lite, characterized by:
- Repeated "paired successfully" notifications
- Frequent HID disconnections and reconnections
- LMP (Link Manager Protocol) collisions during sniff mode transitions
- ACL TX credit stalls causing button input loss

## Root Cause Analysis

Switch Lite has stricter Bluetooth timing requirements compared to regular Switch:
1. **LMP Collision**: ESP32 send task timing conflicts with Switch Lite's sniff mode requests
2. **Modem Sleep Issues**: ESP32 power management interferes with BT link stability
3. **MAC Validation**: Switch Lite validates device info replies more strictly
4. **Timing Sensitivity**: Tighter windows for subcommand handshake completion

## Solution Overview

Modified ESP32 Bluetooth stack behavior to accommodate Switch Lite's requirements while maintaining compatibility with regular Switch consoles.

## Detailed Changes

### 1. Bluetooth Modem Sleep Disabled
**File**: `classic_bt_controller_transport.cpp`
**Change**: Added `esp_bt_sleep_disable()` call in `initializeClassicBluetooth()`
**Rationale**: Prevents ESP32 from entering modem sleep which disrupts BT timing stability required by Switch Lite
**Impact**: Slightly higher power consumption but stable BT connections
**Note**: Runtime disable overrides any sdkconfig settings

### 2. Send Task Timing Adjustment
**File**: `classic_bt_controller_transport.cpp`
**Change**: Increased `kIdleConnectedReportIntervalMs` from 15ms to 100ms
**Rationale**: Reduces report frequency to prevent interference with Switch Lite's sniff mode transitions
**Impact**: Less aggressive link keepalive but prevents LMP collisions

### 3. Extended Congestion Handling
**File**: `classic_bt_controller_transport.cpp`
**Change**: Increased `kHidCongestionRetryBudgetMs` from 120ms to 300ms
**Rationale**: Switch Lite requires more time for L2CAP queue processing
**Impact**: More patient retry logic for congested connections

### 4. HID Connection Management
**File**: `classic_bt_controller_transport.cpp`
**Change**: Enhanced `ESP_HIDD_OPEN_EVT` handler with immediate scan mode setting and report sending
**Rationale**: Prevents connection conflicts and maintains link activity during pairing
**Impact**: Faster, more stable initial connections

### 5. MAC Address Handling
**File**: `classic_bt_controller_transport.cpp`
**Change**: Hardcoded MAC in device info reply, derived base MAC with Nintendo OUI
**Rationale**: Ensures Switch Lite accepts device identification
**Impact**: Consistent device recognition across power cycles

### 6. Logging Improvements
**File**: `classic_bt_controller_transport.cpp`
**Change**: Suppressed routine congestion warnings
**Rationale**: Reduces serial noise from expected Switch Lite behavior
**Impact**: Cleaner debug output

## Testing Results

**Before Fixes**:
```
INFO bt hid event=open status=0 conn=0 peer=...
INFO bt intr report=1 len=48 subcmd=2 ...
INFO bt reply label=reply02 ...
INFO bt intr report=1 len=48 subcmd=3 ...
INFO bt hid event=close status=0 conn=2  ← Connection drops
INFO bt reconnectable reason=hid-close ...
INFO bt hid event=open status=0 conn=0 peer=...  ← Repeated pairing
```

**After Fixes**:
```
INFO bt hid event=open status=0 conn=0 peer=...
INFO bt intr report=1 len=48 subcmd=2 ...
INFO bt reply label=reply02 ...
INFO bt intr report=1 len=48 subcmd=8 ...
... (SPI reads) ...
INFO bt intr report=1 len=48 subcmd=3 ...
INFO bt intr report=1 len=48 subcmd=48 ...
ECHO raw command="A"
INFO action=button name=A
OK
← Stable connection, no repeated pairing
```

## Compatibility Assessment

✅ **Switch Lite**: Full compatibility achieved
✅ **Regular Switch**: Maintained existing functionality
✅ **Power Consumption**: Acceptable increase for stability
✅ **Performance**: No degradation in button response
✅ **Reliability**: Eliminated connection drops and repeated pairing

## Files Modified

- `firmware/esp32/src/classic_bt_controller_transport.cpp`: Core BT logic adjustments
- `firmware/esp32/MODE_FLAPPING_FIX.md`: Documentation (this file)

**Note**: `sdkconfig.esp32dev_wireless` and `platformio.ini` changes were not necessary as BT sleep is disabled at runtime

## Future Considerations

- Monitor for BT stack updates that may affect Switch Lite compatibility
- Consider firmware-level sniff mode rejection if LMP issues reoccur
- Evaluate power consumption impact for battery-powered applications
