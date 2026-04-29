# Arrival-Day Checklist

Use this checklist when your ESP32-WROOM-32 / ESP-32S board arrives.

## Path note

- Serial device names shown below are examples
- Replace values such as `/dev/cu.SLAB_USBtoUART` with your own device path
- If `pio` is already in your shell `PATH`, you can use `pio ...`; otherwise keep using the full `~/.platformio/penv/bin/pio ...` form

## 1. Connect the board

- Plug the board into your Mac with a data-capable USB-C cable
- Run `npm run dev -- --list-ports`
- Confirm you see a port such as `/dev/cu.SLAB_USBtoUART` or `/dev/cu.usbserial-*`

If no serial port appears, install the official CP210x VCP driver from Silicon Labs:
https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers

## 2. Flash firmware

Try the generic environment first:

```bash
pio run -e esp32dev_wireless -t upload
pio device monitor -b 115200
```

Note:

- the first build is slower than before because `esp32dev_wireless` now uses `Arduino + ESP-IDF`
- this is required so the firmware can link the `Bluetooth Classic HID` stack

If your specific clone behaves more like a NodeMCU-32S during upload, switch to:

```bash
pio run -e nodemcu_32s_wireless -t upload
pio device monitor -b 115200
```

## 3. Confirm boot log

After reset, the serial monitor should print a boot line similar to:

```txt
BOOT switch-auto-draw board=esp32-classic transport=classic-bt-hid mock=false
```

That means the firmware started, the serial path is alive, and the Bluetooth transport layer is selected.

## 4. Run protocol smoke test

Use the canned command file:

```bash
npm run dev -- --commands-file ./examples/smoke-test-commands.txt --port <your-serial-port> --send
```

Expected result:

- the Mac CLI shows command progress
- the board returns sequenced ACK lines such as `OK a1b2c3d4 1` for each command
- the serial monitor prints `INFO transport=classic-bt-hid` when the `I` command runs
- the `I` command also prints Bluetooth readiness fields such as `bt_hid_ready`, `bt_app_registered`, and `bt_discoverable`

## 5. Move to image-driven tests

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
- Bluetooth Classic HID stack bring-up and discoverability

It still does not prove Switch compatibility by itself. The current firmware exposes a generic gamepad HID skeleton; Switch-specific pairing behavior and report tuning still need real-device validation.
