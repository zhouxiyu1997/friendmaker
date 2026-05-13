# Quick Start

[简体中文](../user-trial-guide.md)

This document exists for one purpose: help you complete one real end-to-end run, from install and startup to actually starting a drawing.

The current unified workflow is:

`Firmware Flash -> Controller Test -> Timing Tune / Benchmark -> Script Studio`

Before you start:

- This is not a `zero-setup`, consumer-style plug-and-play tool
- A first successful run still usually involves `ESP32` flashing, serial-port or driver setup, `Switch` controller pairing, and timing adjustment
- If you have never worked with `ESP32`, `PlatformIO`, or similar device workflows before, follow the steps in order; the first environment setup usually needs stable internet access, and you should leave time for setup and debugging

If you have not read the project overview yet, start from the repo home page: [README](../../README.md#en).
If you hit issues with serial, networking, firmware, connection, or drift, jump directly to [Troubleshooting](troubleshooting.md).

## 1. Understand the project first

### 1.1 What it is

`Friend Maker` is an automatic drawing workspace for `Nintendo Switch Tomodachi Life`.

It converts images into pixel previews and action scripts, then uses an `ESP32-WROOM-32 / ESP-32S` to emulate `Switch Pro Controller` input and draw inside the in-game canvas.

### 1.2 Current mainline capabilities

The current version already brings these into one workflow:

- `Firmware Flash`
- `Controller Test`
- `Timing Tune / Benchmark`
- `Script Studio`
- image import, pixel preview, template cropping, and automatic background removal
- `mono drawing`
- `official palette drawing`
- `custom multicolor`
- pause, resume, stop, and recovery sessions

### 1.3 Current usage guidance

- The current mainline officially supports `mono drawing`, `official palette drawing`, and `custom multicolor`
- For a first trial, it is still best to use `mono drawing` or simpler images to validate the whole chain
- The first priority is still `input stability`, not drawing speed
- The system is currently modeled as `256x256` and `start from canvas center`
- Some `ESP32` compatible boards still vary during the controller connection phase

### 1.4 Three things you must know before drawing

Before you start real drawing, confirm these three things:

1. The brush size inside `Switch` already matches the value in the web UI
2. After entering the drawing page, the brush and cursor are sitting at the `canvas center`
3. If you use `official palette drawing`, the game's `9` palette slots still keep their default colors

Extra reminders:

- The recovery flow also assumes that you re-enter the drawing page and continue from the `canvas center`
- After drawing starts, do not touch the controller or the screen again
- Using the square brush first is strongly recommended

## 2. Prepare hardware and environment

At minimum, prepare:

- a `macOS` or `Windows x64` computer
- one `ESP32-WROOM-32 / ESP-32S` board
- one `Nintendo Switch`
- one USB cable that supports data transfer
- a `stable network connection`

Additional notes:

- Common compatible boards such as `ESP32 DevKitC` and `NodeMCU-32S` are usually also fine
- `ESP32-C3 / ESP32-S3 / ESP32-C6` are not recommended as the current mainline path
- The first `PlatformIO` and dependency setup still needs a stable network connection; if the network is unstable, preparation may fail or become much slower
- `Windows ARM64` is not in the current support scope

See [Wiring Notes](wiring.md) for the hardware connection layout.

## 3. Choose your entry route

The project currently supports two parallel entry routes: `packaged desktop app` and `repo-based workflow`.
The installation methods are different, but once the app is running they converge into the same four-page workflow.

### 3.1 Route A: packaged desktop app

#### macOS

- open the `.dmg`
- drag `Friend Maker.app` into `Applications`
- launch `Friend Maker`

#### Windows x64

- run the `.exe` installer
- finish the installer steps
- launch `Friend Maker` from the desktop shortcut or Start menu

Pay attention to these first-run notes:

- Do not install the app under a Chinese-character path
- On first entry to `Firmware Flash`, click `Prepare PlatformIO` if the app says it is missing
- If the app says `Python` is missing, allow it to download an app-local runtime used by `Friend Maker`
- On `Windows`, if `PlatformIO` is ready but no serial port appears, try the in-app `CP210x` driver helper first, then `CH340/CH341`

Platform-specific details:

- [Windows Notes](setup-windows.md)
- [macOS Notes](setup-mac.md)

### 3.2 Route B: repo-based workflow

If you want to run directly from the repository, prepare:

- `Node.js 20+`
- `npm 10+`
- `PlatformIO Core 6+`
- working `Python 3` on `Windows` if you install `PlatformIO` manually

Common startup flow:

#### Start manually

```bash
cd /path/to/friendmaker
npm install
npm run check
npm run ui:dev
```

Then open:

```text
http://127.0.0.1:4307
```

#### One-click start script on macOS

You can also double-click:

- `Start Friend Maker.command`

That script jumps into `scripts/macos-launch.sh`, checks dependencies, and starts the local UI automatically.

#### One-click install script on Windows

You can also double-click:

- `Install Friend Maker.cmd`

That script checks `Node.js`, `npm`, `Python 3`, and `PlatformIO`, then runs:

- `npm install`
- `npm run check`

Notes:

- it only handles `installation and checks`
- after it finishes, you still need to run `npm run ui:dev` manually

## 4. Flash ESP32 firmware

### 4.1 Recommended path: flash inside the app

After entering `Firmware Flash`, use this order:

1. Choose the `Switch model`
2. Choose the target environment
3. Confirm the serial port
4. Click `Build and Flash Firmware`

The firmware flow now splits `Switch` flashing into 3 models:

- `Switch`: standard `Switch / OLED / V2`
- `Switch 2`: uses a more conservative Bluetooth HID timing profile and sends an extra `virtual cable` request after authentication
- `Switch Lite`: uses the dedicated `SWITCH_LITE` build to improve pairing and input stability

Current recommended environments:

- `esp32dev_wireless`: default recommendation for common `ESP32-WROOM-32 / ESP-32S`
- `nodemcu_32s_wireless`: if the board is clearly labeled `NodeMCU-32S`, you can switch to this one

Extra notes:

- If you choose `Switch 2` or `Switch Lite`, the current supported hardware path is the mainline `ESP32-WROOM-32 / ESP-32S`
- `NodeMCU-32S`-style boards should still stay on the standard `Switch` firmware path for now

This page can also directly handle:

- `Refresh Ports`
- `Prepare PlatformIO`
- Windows serial driver helper installation
- full flashing logs

If flashing fails, check these first:

- whether the cable supports data transfer
- whether another program is occupying the serial port
- whether you selected the wrong target environment

If the board does not enter download mode, hold the physical `BOOT` button and retry.

### 4.2 Command-line fallback

If you are in the repo workflow, or just want to confirm `PlatformIO` by itself, run:

```bash
cd /path/to/friendmaker/firmware/esp32

# Standard Switch / OLED / V2
pio run -e esp32dev_wireless -t upload

# Switch 2 (ESP32-WROOM-32 / ESP-32S only)
pio run -e esp32dev_wireless_switch2 -t upload

# Switch Lite (ESP32-WROOM-32 / ESP-32S only)
pio run -e esp32dev_wireless_switch_lite -t upload
```

If `pio` is not in `PATH`, use the full path instead:

- `macOS`: `~/.platformio/penv/bin/pio`
- `Windows`: `%USERPROFILE%\.platformio\penv\Scripts\pio.exe`

`Windows` example:

```powershell
cd C:\path\to\friendmaker\firmware\esp32

# Standard Switch / OLED / V2
$env:USERPROFILE\.platformio\penv\Scripts\pio.exe run -e esp32dev_wireless -t upload --upload-port COM3

# Switch 2 (ESP32-WROOM-32 / ESP-32S only)
$env:USERPROFILE\.platformio\penv\Scripts\pio.exe run -e esp32dev_wireless_switch2 -t upload --upload-port COM3

# Switch Lite (ESP32-WROOM-32 / ESP-32S only)
$env:USERPROFILE\.platformio\penv\Scripts\pio.exe run -e esp32dev_wireless_switch_lite -t upload --upload-port COM3
```

## 5. Controller test

After firmware flashing succeeds, move to `Controller Test`.

Use this order:

1. Click `Connect Controller`
2. On `Switch`, open `Controllers -> Change Grip/Order`
3. Wait until the status becomes connected / ready to send
4. Then run button, D-pad, and stick step tests

If it fails immediately, use this order:

1. Click `Reset Controller Bluetooth`
2. Wait until it finishes
3. Click `Connect Controller` again
4. On `Switch`, reopen `Change Grip/Order`
5. If it still does not connect, press the board's `EN` button once to reboot it, then retry
6. If it is still unstable, go back to `Firmware Flash` and flash the firmware again

Known realities:

- some `ESP32` compatible boards are more likely to disconnect during pairing
- if the link still keeps dropping after connection is established, also inspect cable quality, power stability, and board variance
- during testing, try to keep the Bluetooth environment clean and reduce nearby active devices

## 6. Timing tune / benchmark

Once the connection can be established stably, move to `Timing Tune / Benchmark`.

This page is not for chasing maximum speed first. It is for making the current `device + board + cable` combination stable first.

Recommended order:

1. Start from the recommended defaults `45 / 65`
2. Adjust `inputDelay` first
3. Only fine-tune `buttonPressDuration` after the link and actions are mostly stable

Rule of thumb:

- `inputDelay` behaves more like a stability knob
- `buttonPressDuration` behaves more like an input-strength knob

If you see any of the following, increase `inputDelay` first:

- chained actions do not land reliably
- occasional drift
- longer runs become more and more unstable

Additional suggestions:

- if the board is already hot, let it cool down before continuing; some boards become more stable again
- if too many Bluetooth devices are active nearby, reduce them first and then keep tuning

## 7. Start drawing

Only return to `Script Studio` after the first three pages are already normal.

### 7.1 Recommended first-run setup

For your first successful run, prefer:

- drawing mode: `mono drawing`
- brush size: `3`
- brush: `square brush`
- image: something structurally simple and high-contrast

Once this chain is stable, then try:

- `official palette drawing`
- `custom multicolor`
- more complex images
- finer brush sizes

### 7.2 Basic steps

1. Import an image
2. Choose `mono drawing`, `official palette drawing`, or `custom multicolor`
3. Adjust template, scale, position, and automatic background removal when needed
4. Click `Generate Commands Only` first and inspect the preview and statistics
5. After that looks right, click `Start Drawing`

### 7.3 About recovery tasks

If you use:

- `Pause Drawing`
- `Stop and Save Recovery Point`
- or the app exits unexpectedly and you reopen it

the app keeps recovery tasks locally.

Before continuing:

1. Save the current artwork inside `Switch`
2. Re-enter the drawing page manually
3. Confirm the brush and cursor are back at the `canvas center`
4. Then continue from the recovery task

## 8. Usage reminders

- Do not unplug the board during drawing
- Do not close `Friend Maker`, and in the repo workflow do not close the local service terminal either
- Do not touch the controller or the `Switch` screen during drawing
- `Pause Drawing` and `Stop and Save Recovery Point` both wait for the current command to finish first
- If `Stopping Drawing` gets stuck for a long time, use the emergency button in the page to clear the stuck state
- If step tests show ghost inputs, sticky inputs, or repeated actions, press the board's `EN` button first and reconnect the controller
- If pressing `EN` immediately fixes ghost or sticky inputs, rerun controller validation before judging drawing or color issues

## 9. More troubleshooting and platform notes

Use the public docs like this:

- [Troubleshooting](troubleshooting.md): start here when something goes wrong
- [Wiring Notes](wiring.md): confirm supported boards, connection layout, cable, and power notes
- [Windows Notes](setup-windows.md): `winget`, driver, and `COM`-port issues
- [macOS Notes](setup-mac.md): serial, driver, and repo-start issues
