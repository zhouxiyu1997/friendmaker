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

## Drawing drifts on Switch

- Increase `cellMoveDuration`
- Increase `inputDelay`
- Reduce canvas size to `32x32`
- Start with the mono profile before enabling palette mode

## Color selection is wrong

- Adjust the placeholder logic in `firmware/esp32/src/controller.cpp`
- Keep the game's palette order fixed while calibrating
