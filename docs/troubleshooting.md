# Troubleshooting

## `sharp` install fails

- Confirm Node.js is at least 18.17
- Re-run `npm install`

## Serial port times out waiting for `OK <session> <seq>`

- Make sure the ESP32 firmware is flashed
- Confirm the baud rate matches both sides
- Use `npm run dev -- --list-ports` to verify the device path
- Open a serial monitor and check whether the board prints sequenced ACK lines such as `OK a1b2c3d4 1`
- Manual serial tests must send sequenced frames, for example `SEQ a1b2c3d4 1 I`; the CLI and Web UI wrap visible commands automatically
- Start with `npm run dev -- --commands-file ./examples/smoke-test-commands.txt --port <device> --send` before trying full image streaming

## ESP32 board does not appear on macOS

- Confirm the cable supports data, not just charging
- Look for a port such as `/dev/cu.SLAB_USBtoUART` or `/dev/cu.usbserial-*` as an example device name
- If the board uses `CP2102` and no port appears, install the official `CP210x VCP` driver from Silicon Labs

## Switch cannot find or keep the controller connected

- Open `Controller Test` and set Bluetooth compatibility to `Auto` first
- If the Switch still bounces during pairing, apply `Pro Controller` and connect again from the Switch `Change Grip/Order` page
- If the Switch shows many stale controllers or keeps trying an old identity, use `System Settings → Controllers and Sensors → Disconnect Controllers` on the Switch, then click `Clear local pairing` in `Controller Test`
- Nintendo's controller unpair flow deletes pairing information for all controllers, not just one specific controller; you will need to pair the controllers you still use again afterwards ([Nintendo Support](https://www.nintendo.com/my/support/qa/detail/37145))
- `Clear local pairing` clears the ESP32-side bond and last-good Bluetooth profile. The `Firmware Flash` page now also erases ESP32 NVS/pairing state before uploading firmware; if you flash from the command line, run `erase` before `upload`
- The firmware intentionally does not use the easier-pairing `Left Joy-Con` identity for drawing: it lacks the full Pro-style button surface, and mapping D-pad moves onto the analog stick needs extra calibration that can hurt drawing precision
- Keep the board close to the Switch and avoid running drawing commands until the status becomes paired/ready
- Use `Export diagnostics` and attach the JSON when filing an issue; it includes the active profile, last-good profile, disconnect status, and recent device logs

## Drawing drifts on Switch

- Increase `cellMoveDuration`
- Increase `inputDelay`
- Reduce canvas size to `32x32`
- Start with the mono profile before enabling palette mode

## Color selection is wrong

- Adjust the placeholder logic in `firmware/esp32/src/controller.cpp`
- Keep the game's palette order fixed while calibrating
