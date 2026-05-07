# Arrival-Day Checklist

[简体中文](../arrival-checklist.md)

This is an internal developer bring-up / smoke-test checklist, not the main public user flow.

Its goal is to use the `Mac + CLI + serial monitor` path to prove a few low-level facts first when a board arrives:

- serial connectivity is working
- firmware can be compiled and flashed
- the ACK protocol path is working
- the `Bluetooth Classic HID` transport layer has started

If you only want the public user flow, start with [Quick Start](user-trial-guide.md).

## Path note

- Serial device names shown below are examples
- Replace values such as `/dev/cu.SLAB_USBtoUART` with your own device path
- If `pio` is already in your shell `PATH`, you can use `pio ...`; otherwise keep using the full `~/.platformio/penv/bin/pio ...` form

## 1. Connect the board

- Plug the board into your Mac with a data-capable USB-C cable
- Run `npm run dev -- --list-ports`
- Confirm you see a port such as `/dev/cu.SLAB_USBtoUART` or `/dev/cu.usbserial-*`

If no serial port appears, install the official `CP210x VCP` driver from Silicon Labs:
https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers

## 2. Flash firmware

Try the generic environment first:

```bash
pio run -e esp32dev_wireless -t upload
pio device monitor -b 115200
```

Notes:

- the first build is slower than before because `esp32dev_wireless` uses `Arduino + ESP-IDF`
- this is required so the firmware can link the `Bluetooth Classic HID` stack

If your specific clone behaves more like a `NodeMCU-32S` during upload, switch to:

```bash
pio run -e nodemcu_32s_wireless -t upload
pio device monitor -b 115200
```

## 3. Confirm the boot log

After reset, the serial monitor should print a boot line similar to:

```txt
BOOT switch-auto-draw board=esp32-classic transport=classic-bt-hid mock=false
```

That means:

- the firmware started
- the serial path is alive
- the Bluetooth transport layer was selected correctly

## 4. Run a protocol smoke test

Use the built-in command file:

```bash
npm run dev -- --commands-file ./examples/smoke-test-commands.txt --port <your-serial-port> --send
```

Expected result:

- the Mac CLI shows command progress
- the board returns sequenced ACK lines such as `OK a1b2c3d4 1` for each command
- the serial monitor prints `INFO transport=classic-bt-hid` when the `I` command runs
- the `I` command also prints Bluetooth readiness fields such as `bt_hid_ready`, `bt_app_registered`, and `bt_discoverable`

## 5. Move on to image-driven tests

Once the smoke test is stable:

```bash
npm run dev -- --image ./examples/demo.svg --preview ./tmp/demo-preview.png --write-commands ./tmp/demo-commands.txt
```

Then stream the generated commands:

```bash
npm run dev -- --image ./examples/demo.svg --port <your-serial-port> --send
```

## 6. What this validates

- Mac to ESP32 serial connectivity
- command framing and ACK behavior
- pause / resume / stop controls
- timing placeholders for motion and button actions
- whether the `Bluetooth Classic HID` stack can start and become discoverable

It still does not prove by itself:

- that the board can already pair stably with `Switch`
- that the current report format and pairing behavior are fully good enough on real hardware
- that the packaged desktop workflow, driver helpers, recovery sessions, or drawing-template flow are all already healthy

The current firmware still exposes a generic gamepad HID skeleton. Real `Switch` pairing behavior and report timing still need real-device validation.

## 7. What to do next after this passes

If this internal checklist is already passing, the next step is to return to the formal workflow:

1. open the packaged desktop app, or run `npm run ui:dev`
2. continue with `Firmware Flash -> Controller Test -> Timing Tune / Benchmark -> Script Studio`
3. if low-level bring-up already passes but the desktop workflow still fails, investigate `PlatformIO` preparation, resource paths, driver-helper entry points, or page-side integration first
