# Troubleshooting

[简体中文](../troubleshooting.md)

This document only covers the most common problems in the current public workflow.
Use it by asking one question first: which page are you blocked on right now?

If you have not gone through the full main flow yet, start with [Quick Start](user-trial-guide.md).
If you are in mainland China and specifically need mirror or alternate download paths, see the Chinese-only [Mainland Network Notes](../troubleshooting-mainland-network.md).

## 1. No serial port appears in the page

Check these first:

- whether the USB cable supports `data transfer`, not just charging
- whether the board has already been unplugged and replugged once
- whether another program is already holding the serial port

Recommended order:

1. Replug the board
2. Click `Refresh Ports` in the app
3. If you are running from the repo workflow, try:

```bash
npm run dev -- --list-ports
```

4. On `Windows x64`, if `PlatformIO` is ready but no serial port appears:
   - install the `CP210x` driver first
   - replug the board
   - then try `CH340/CH341`
5. On `macOS`, if your board uses `CP210x` or `CH340/CH341`, confirm the correct serial driver is already installed

Related documents:

- [Windows Notes](setup-windows.md)
- [macOS Notes](setup-mac.md)
- [Wiring Notes](wiring.md)

## 2. PlatformIO / Python / network preparation fails

Common signals:

- the `Firmware Flash` page says `PlatformIO` is missing
- `Prepare PlatformIO` fails
- the app says `Python` is missing
- toolchain or dependency downloads stall, fail, or retry forever

Check these first:

- whether the current network is stable
- whether you are in an offline, weak-network, or proxy-restricted environment
- on `Windows`, whether the app is allowed to download its local `Python` runtime

Recommended order:

1. Switch to a more stable network and retry
2. Click `Prepare PlatformIO` again
3. If the app says `Python` is missing, allow the download
4. If you are in the repo workflow, you can also install `PlatformIO` manually

Manual install example:

```powershell
python -m pip install --user --upgrade platformio
```

Notes:

- the first `PlatformIO` and toolchain preparation step being slow is normal
- on `Windows` repo setups, `Python` is one of the prerequisites for manual `PlatformIO` installation

## 3. Firmware flashing fails

Common signals:

- `Build and Flash Firmware` fails
- the serial port is reported as busy
- firmware upload is interrupted
- the board never enters download mode

Check these first:

- whether the serial port is being used by:
  - `pio device monitor`
  - the Arduino serial monitor
  - another serial tool
- whether the selected target environment is correct
- whether the cable and power delivery are stable

Recommended order:

1. Close every serial monitor and serial tool
2. Go back to the app and click `Refresh Ports`
3. Confirm the flashing selection:
   - for common `ESP32-WROOM-32 / ESP-32S`, start with `Switch` + `esp32dev_wireless`
   - if the target console is `Switch 2`, switch the model to `Switch 2`
   - if the target console is `Switch Lite`, switch the model to `Switch Lite`
   - if your board is clearly labeled `NodeMCU-32S`, you can switch to `nodemcu_32s_wireless`, but it should still stay on the standard `Switch` firmware path for now
4. Click `Build and Flash Firmware` again
5. If the board does not enter download mode, hold the physical `BOOT` button and try flashing again
6. If the desktop flow keeps failing, and your board is the mainline `ESP32-WROOM-32 / ESP-32S`, you can also switch to [Friend Maker Firmware Flasher](https://zhouxiyu1997.github.io/friendmaker/) and flash directly from desktop `Chrome / Edge`; the web flasher also exposes `Switch`, `Switch 2`, and `Switch Lite` as separate model options
7. If the web flasher is not an option, or you still want to confirm the local firmware path itself, switch to manual command-line flashing

Manual flash command:

```bash
cd /path/to/friendmaker/firmware/esp32

# Standard Switch / OLED / V2
pio run -e esp32dev_wireless -t upload

# Switch 2 (ESP32-WROOM-32 / ESP-32S only)
pio run -e esp32dev_wireless_switch2 -t upload

# Switch Lite (ESP32-WROOM-32 / ESP-32S only)
pio run -e esp32dev_wireless_switch_lite -t upload
```

If `pio` is not in `PATH`, use the full path form described in [Quick Start](user-trial-guide.md).

## 4. Controller does not connect or disconnects easily

This is still a known reality in the current version.
The project already includes reset, reconnect, and recovery flows, but different boards still vary in USB-serial chip quality, power stability, and overall build quality.

Recommended order:

1. Click `Reset Controller Bluetooth` on the `Controller Test` page
2. Wait for it to finish, then click `Connect Controller`
3. On the `Switch`, reopen `Controllers -> Change Grip/Order`
4. If it still does not connect, press the board's `EN` button once to reboot it, then retry
5. If it is still unstable, go back to `Firmware Flash` and flash the firmware again
6. If disconnects still happen often, also inspect:
   - cable stability
   - power stability
   - board-to-board variance
   - too many nearby active Bluetooth devices
   - whether the board is already hot
7. If the normal steps still do not work, you can also try the [Quark drive mirror: friend maker (Teacher Zhang optimized build)](https://pan.quark.cn/s/08ca5bdebc46)

Quark passcode: `/~995f3YSMso~:/`

Notes:

- the main test device usually stays stable after the controller link is established
- frequent disconnects during pairing are not always caused by one single software bug
- a cleaner Bluetooth environment usually helps
- some boards become less stable when they get hot, so cooling them down can help

## 5. Step tests show ghost inputs, sticky inputs, or unexpected repeats

Recommended order:

1. Press the board's `EN` button once to reboot it
2. Go back to `Controller Test` and click `Connect Controller` again
3. Run another round of button, D-pad, or stick step tests
4. If it keeps happening, also inspect:
   - cable stability
   - power stability
   - board variance
   - too many nearby active Bluetooth devices
   - whether the board is already hot

Additional notes:

- these symptoms often come together with link instability, board state issues, or power fluctuations
- if rebooting the board helps, it usually means the current link state was refreshed

If the issue disappears after pressing `EN`, it is more likely that the board state, Bluetooth HID report path, or a transient power / thermal condition was refreshed; in that case, rerun `Controller Test` and `Timing Tune / Benchmark` first, and do not treat the previous abnormal drawing result as evidence that color recognition or `official palette drawing` itself is wrong.

## 6. Drawing drifts, offsets, or becomes less stable over longer runs

Check these first:

- whether you already ran `Timing Tune / Benchmark`
- whether the brush size in `Switch` matches the value in the web UI
- whether the cursor really starts from the `canvas center`
- whether the controller or touchscreen was touched again after drawing started

Recommended order:

1. Go back to `Timing Tune / Benchmark` and start from the recommended defaults `45 / 65`
2. Increase `inputDelay` first
3. Only fine-tune `buttonPressDuration` after stability is basically acceptable
4. For the first few tests, prefer:
   - `mono drawing`
   - simpler images
   - brush size `3` or larger
5. If it is still unstable, repeat the full chain:
   - `Firmware Flash`
   - `Controller Test`
   - `Timing Tune / Benchmark`

Rule of thumb:

- `inputDelay` behaves more like a stability knob
- `buttonPressDuration` behaves more like an input-strength knob

## 7. Colors still show slight differences from the preview

The current build keeps the web preview, generated commands, and final drawing colors much closer than before. If you still notice small differences, they are usually caused by in-game display and brush behavior rather than the preview picking a different color on its own.

Common reasons:

- real-device appearance is affected by brush size, edge anti-aliasing, and the game's own display behavior
- `official palette drawing` still has to map into the game's built-in `7x12` palette, so it cannot be a pixel-perfect match for every source image
- if you manually changed the `9` palette slots on the right, the assumptions behind `official palette drawing` no longer hold

Suggestions:

1. Confirm that the selected mode, color count, and `Current Preview Colors` panel all match your expectation
2. Keep the game's default `9` palette slot colors when using `official palette drawing`
3. For color-sensitive images, try a higher color count and a smaller brush first
4. If this is your first test, start with a structurally simple image to validate the full pipeline

## 8. Where to look next

- [Quick Start](user-trial-guide.md)
- [Wiring Notes](wiring.md)
- [Windows Notes](setup-windows.md)
- [macOS Notes](setup-mac.md)
