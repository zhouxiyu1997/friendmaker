# Hardware Guide (S2 Mini / WiFi + USB HID)

[中文版](../hardware-s2-wifi.md)

This is an experimental path: the desktop application sends commands to an ESP32-S2 over **WiFi TCP**, and the board sends inputs to the Switch 2 via **USB HID**, emulating a wired HORIPAD S controller.

## 1. Who this is for

- Owners of a **Lolin S2 Mini** dev board
- Target console is **Switch 2** (Switch 1 / Lite does not support USB HID host mode)
- Users seeking to eliminate Bluetooth pairing, disconnection, and latency jitter

## 2. Required hardware

| Item | Detail |
|------|------|
| Dev board | Lolin S2 Mini (ESP32-S2FNR2, 240MHz, 4MB Flash, 2MB PSRAM) |
| Purchase keyword | `Lolin S2 Mini` / `WEMOS S2 Mini` |
| WiFi router | 2.4GHz WiFi LAN (same network as desktop PC) |
| USB cable | **Data-capable** USB-C cable |
| Target device | Switch 2 (handheld mode, USB-C direct connection) |

## 3. Connection topology

```
Desktop PC ──WiFi──▶ Router ◀──WiFi── ESP32-S2
                                        │
                                   USB-C cable
                                        │
                                        ▼
                                   Switch 2
                              (recognized as HORIPAD S)
```

The full chain:

1. PC sends SEQ-framed commands over WiFi to `192.168.1.200:9876` (or `friendmaker.local`)
2. ESP32-S2 receives, parses, and sends button/stick reports over USB HID to Switch 2
3. Switch 2 recognizes the device as a wired HORIPAD S controller

## 4. Power & plug/unplug workflow

The S2 Mini has a single USB-C port used for both flashing/debugging and Switch connection:

```
① PC USB (flash firmware)
② Unplug S2 Mini (brief power loss)
③ Plug into Switch 2 USB-C port
④ Switch Dock USB-A provides power → S2 Mini boots → firmware starts
⑤ WiFi auto-reconnect (~3s) → TCP Server ready
⑥ LED solid = all ready
```

### LED status codes

| LED State | Meaning |
|------|------|
| Fast blink | WiFi connecting |
| Slow blink | Waiting for USB bus |
| **Solid** | **All ready (WiFi + USB HID)** |

### Power guarantees

- Switch Dock USB-A provides standard 5V, sufficient for ESP32-S2
- Firmware uses static IP (`192.168.1.200`), no DHCP dependency
- mDNS hostname `friendmaker.local` registered for zero-config discovery
- `WiFi.setSleep(false)` prevents power-save disconnection

## 5. Desktop connection

1. Start the desktop app: `npm run ui:dev`
2. **Switch transport mode to `WiFi (ESP32-S2 USB HID)`** on any page
3. Select WiFi address: `friendmaker.local` (recommended) or `192.168.1.200`
4. Go to the **Controller Test** page, click "Connect Controller"
5. Once connected, use single-step tests or full drawing

## 6. Flashing firmware

### Option A: Built-in flasher in the desktop app

On the Firmware page, select:
- Model: `Switch 2`
- Environment: `Lolin S2 Mini (USB HID)`

Then click "Build & Flash".

### Option B: Command line

```bash
cd firmware/esp32/test_s2
# Configure SSID & password in wifi_credentials.h first
python -m platformio run -t upload --upload-port COM3
```

### Notes

- The S2 Mini must be plugged into **PC USB** during flashing (not the Switch)
- If auto-download fails (`Couldn't find a board`), hold the **BOOT button** on the S2 Mini while plugging into PC USB, then re-run the flash command
- After flashing, unplug, insert into Switch 2 USB-C, wait ~25 seconds until LED is solid

## 7. Differences from the Bluetooth path

| Comparison | Bluetooth (ESP32) | WiFi (S2 Mini) |
|------|------|------|
| Connection | USB Serial → Bluetooth | WiFi TCP → USB HID |
| Bluetooth pairing required | ✅ Every time | ❌ None |
| Disconnection risk | BT interference | Only if WiFi drops (auto-reconnect) |
| Latency | 16ms BT interval + L2CAP congestion | <5ms TCP LAN latency |
| Per-step time (65/45 timing) | ~150ms (unstable) | **110ms (zero jitter)** |
| Switch 1 / Lite | ✅ | ❌ |
| Switch 2 | ✅ | ✅ |
| Desktop transport | Serial port selector | WiFi transport + address dropdown |

## 8. Quick pre-flight check

1. S2 Mini flashes successfully (appears as COM3 on PC)
2. WiFi credentials configured in `wifi_credentials.h`
3. After flashing, plug into Switch 2 USB-C, wait for solid LED
4. Desktop: select WiFi transport → `friendmaker.local`
5. Controller Test page: click "Connect Controller" → shows "USB HID Controller Connected"
6. Single A-button test → UI reaction visible on Switch 2

If stuck, verify:

- S2 Mini WiFi and desktop PC are on the **same router**
- Firewall is not blocking TCP port 9876
- S2 Mini LED is **solid** (not blinking)