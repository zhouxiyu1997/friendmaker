# Friend Maker PRD

[简体中文](../PRD.md)

Version: v0.2
Status: Alpha trial
Updated: 2026-05-07

## 1. Product overview

`Friend Maker` is an automatic drawing tool built around `macOS / Windows x64 + ESP32-WROOM-32 / ESP-32S + Nintendo Switch`.

The user imports an image on the computer, adjusts drawing parameters, and generates an action script. An ESP32 then emulates a `Bluetooth Classic` Switch Pro Controller and draws the image onto the `Tomodachi Life` canvas in a stable and repeatable way.

The current version is no longer just a script-generation prototype. It is now a packaged desktop application that embeds the same local web workspace, while still keeping the repo-based workflow as a development, debugging, and protocol-validation entry path. The mainline workflow is still organized around these four pages:

- `Script Studio`
- `Firmware Flash`
- `Controller Test`
- `Timing Tune / Benchmark`

The current product still follows three guiding principles:

- stability before speed
- repeatability before flashy automation
- debuggability before autonomy

## 2. One-line summary of the current version

As of `2026-05-07`, the repository already supports one testable closed loop:

`Packaged desktop app / repo-based workflow -> Firmware Flash -> Controller Test -> Timing Tune / Benchmark -> Script Studio -> serial ACK transport -> ESP32 Bluetooth controller output -> Switch canvas drawing`

The recommended first-run order is fixed as:

1. `Firmware Flash`
2. `Controller Test`
3. `Timing Tune / Benchmark`
4. `Script Studio`

## 3. Problems the product is solving right now

Manually recreating an image inside the Switch drawing canvas has several practical problems:

- too much repetitive work
- cursor movement drifts easily and ruins the full picture
- color switching is tedious and easy to mess up
- the same image is hard to reproduce consistently
- once the hardware chain breaks, it is hard to tell where the failure happened

The current goal is not to solve fully automatic, high-fidelity multicolor drawing for arbitrary images in one step. The current goal is to make this narrower promise stable first:

`Users can finish flashing, controller setup, image import, and real drawing inside one local workspace, and every stage stays observable and debuggable.`

## 4. Target users

### 4.1 Core users

- maker-style users who can tolerate dev boards, serial ports, and basic command-line work
- early testers who want to recreate pixel art, character art, or logo-like images inside the Switch drawing page
- users who are willing to start from fixed assumptions and tune parameters gradually

### 4.2 Non-target users

- users who expect plug-and-play consumer behavior
- users who do not want to touch boards, firmware, or serial tooling
- users who expect arbitrary games, arbitrary canvases, and arbitrary color spaces to be auto-adapted

## 5. Current version goals

### 5.1 Product goals

- connect the packaged desktop entry, repo-based workflow, and the four-page web workflow into one coherent local system
- let flashing, connection testing, timing tuning, and drawing all happen inside one local toolchain
- move `mono drawing`, `official palette drawing`, and `custom multicolor` into a state that is testable, repeatable, and debuggable

### 5.2 Success criteria for the current alpha

The current alpha should satisfy at least the following:

- users can launch the packaged desktop app on `macOS` or `Windows x64`, or start the local workspace through the repo workflow
- users can enter the `Script Studio / Firmware Flash / Controller Test / Timing Tune / Benchmark` pages normally
- users can import `PNG / JPG / SVG` and inspect previews, statistics, and actual command scripts
- users can flash ESP32 firmware through local `PlatformIO` from the page
- users can connect the controller, reset Bluetooth, and run button / stick tests from the page
- users can tune `inputDelay / buttonPressDuration` and run loopback timing tests from the page
- users can send scripts over serial in `ACK` mode and observe the process in logs
- users can finish mono, official-palette, or custom-multicolor drawing under the current fixed assumptions
- users can see persisted recovery sessions and resume unfinished drawings
- users can choose a drawing template and see its effect in both preview generation and final command generation

## 6. Capabilities already completed

### 6.1 Desktop app and runtime

- `Electron` desktop shell is already in place
- packaged build paths already exist for `macOS` (`dmg` / `zip`)
- packaged build path already exists for `Windows x64` (`nsis`)
- the repo-based workflow is still available for development, debugging, and protocol validation
- packaged builds include firmware resources, app icons, and bundled `Windows` driver resources
- the packaged runtime copies firmware into a writable directory before handing it to `PlatformIO`

### 6.2 Script Studio

- fixed `256x256` script-coordinate canvas
- six brush sizes: `1 / 3 / 7 / 13 / 19 / 27`
- `mono drawing`
- `official palette drawing`
- `custom multicolor`
- official-palette quantization levels: `8 / 16 / 32 / 64 / 84`
- custom-multicolor quantization levels: `8 / 9 / 16 / 18 / 24 / 32 / 64 / 84 / 128`
- image scale and X/Y offset
- automatic background removal
- drawing templates, template previews, and template category selection
- official palette preview and used-color highlighting
- copy, download, and execute command scripts
- one-click drawing start
- pause / resume / stop / forced recovery-state reset
- fixed-height scrolling execution log

### 6.3 Firmware Flash page

- automatic local `PlatformIO` detection
- firmware environment and serial-port selection
- direct compile-and-flash flow inside the page
- result cards for flash outcomes
- full flash logs
- `Windows` driver helper entry points

### 6.4 Controller Test page

- refresh serial ports
- connect controller
- reset controller Bluetooth
- D-pad / stick / button step tests
- custom test command sending
- display discovery, authentication, connection, pairing, and ready-to-send states
- display recent host, transport layer, initialization steps, and errors
- fixed-height scrolling test log

### 6.5 Timing Tune / Benchmark page

- adjust `inputDelay` and `buttonPressDuration`
- persist timing values locally
- quick D-pad / button taps
- loopback benchmark and result cards
- sync timing into the final drawing script through `CFG INPUT`

### 6.6 Recovery sessions and drawing templates

- recovery sessions are persisted under the user's documents directory
- paused, interrupted, or crashed runs can be reopened from saved recovery state
- recovery records store command progress, resume plans, serial options, and preview summaries
- drawing templates have separate definitions, categories, mask assets, and preview assets
- template cropping directly affects both preview generation and final command generation

### 6.7 Firmware and protocol

- text-protocol parsing
- serial ACK transport path
- base commands such as `I / H / M / P / A / B / X / Y / C / W / S / R / E`
- `BC RESET` and official-palette slot configuration commands
- Bluetooth controller state reading
- test commands such as `TAP`, `HOLD`, and `STICK`

## 7. Scope and non-goals

### 7.1 In-scope for the current version

- platforms:
  - packaged desktop app on `macOS`
  - packaged desktop app on `Windows x64`
  - repo-based workflow on `macOS / Windows`
- local form factor: `Electron desktop app + embedded local web workspace + TypeScript development toolchain`
- hardware mainline: `ESP32-WROOM-32 / ESP-32S`
- controller path: `ESP32 Bluetooth Classic -> Switch`
- target scene: the Switch version of the `Tomodachi Life` drawing page

### 7.2 Explicit non-goals for now

- formal `Linux` packaging and formal `Linux` support
- automatic visual calibration
- exact custom-color auto tuning
- automatic recognition of arbitrary game UIs
- detached offline execution after uploading a task

## 8. Key user flows

### 8.1 First-run flow

1. Launch the packaged desktop app, or start the local workspace through the repo workflow
2. Flash the recommended firmware from `Firmware Flash`
3. Complete Bluetooth connection and button validation in `Controller Test`
4. Use `Timing Tune / Benchmark` to stabilize the current board, cable, and timing values first
5. Return to `Script Studio`, import an image, and adjust parameters
6. Generate preview and commands first, then start the real drawing

### 8.2 Day-to-day drawing flow

1. Open the packaged app or local debug entry
2. Confirm controller status quickly
3. Import a new image
4. Choose `mono drawing`, `official palette drawing`, or `custom multicolor`
5. Confirm brush size, center-start assumption, template selection, and official-palette slot assumptions
6. Start drawing and watch progress through logs and recovery state

## 9. Technical and scene assumptions

The current mainline is built on these fixed assumptions:

- the target canvas is modeled as `256x256` script coordinates
- before drawing starts, the brush / cursor is already at the center of the canvas
- the brush size inside `Switch` has already been changed manually to match the web UI
- using the square brush is recommended
- `A` performs drawing
- the D-pad performs one-cell movement
- if `official palette drawing` is used, the game's right-side `9` palette slots are still at their default colors

These are not the final product shape. They are the current engineering boundaries chosen for stability.

## 10. Current limitations

- the workflow still depends on fixed scene assumptions instead of full auto calibration
- the official `7x12` palette is still being calibrated
- `custom multicolor` is already available as a formal feature, but color fidelity and long-run stability still need more work
- the desktop app still depends on successful local `PlatformIO`, toolchain, and upstream download preparation
- packaged installation flow and error messaging still need more polish, especially on `Windows`

## 11. Milestone status

### Phase 0: local workspace established

Status: completed

- the four-page local web workspace is in place
- public docs, developer docs, test flows, and example assets are in place

### Phase 1: serial transport and script execution

Status: completed

- image preview, command generation, and serial ACK transport are connected
- logs and pause / resume / stop controls are connected

### Phase 2: desktop shell and bundled resources

Status: completed

- the `Electron` main-process entry is in place
- packaged build scripts exist for `macOS` and `Windows x64`
- packaged firmware copying, icon resources, and bundled `Windows` driver resources are in place

### Phase 3: in-page flashing and device validation

Status: completed to the usable-test stage

- local `PlatformIO` can be invoked from the page
- flash results and logs are visible
- controller connection, state reading, and step tests are connected

### Phase 4: full drawing loop and recovery capability

Status: entered alpha trial

- `Firmware Flash -> Controller Test -> Timing Tune / Benchmark -> Script Studio -> Start Drawing` is now runnable
- mono, official-palette, and custom-multicolor flows are all testable
- recovery sessions and drawing templates are part of the formal workflow

### Phase 5: later optimization stage

Status: ongoing

- visual calibration
- offline execution
- more stable color and position calibration
- more complete packaged install, recovery, and troubleshooting UX

## 12. Acceptance criteria for the current stage

The current stage should be accepted against these criteria:

- `npm run check` and `npm run build` pass
- the packaged desktop entry launches and opens the four-page workflow
- `Firmware Flash` can detect `PlatformIO` and serial ports
- `Controller Test` can show connection state and send test commands
- `Script Studio` can generate preview, script, and execution statistics
- recovery sessions can be written, reloaded, and resumed
- drawing templates can be selected and reflected in both preview output and final command generation
- during real execution, logs stay observable and commands advance through ACK

## 13. Matching implementation in the repository

- desktop packaging and scripts: `package.json`
- desktop main process: `apps/desktop/src/electron/main.ts`
- web UI service: `apps/desktop/src/web/server.ts`
- web UI interaction: `apps/desktop/src/web/static/app.js`
- web UI page: `apps/desktop/src/web/static/index.html`
- recovery sessions: `apps/desktop/src/web/recoverySessions.ts`
- drawing templates: `apps/desktop/src/drawingTemplates.ts`
- image processing: `apps/desktop/src/image/*`
- path generation: `apps/desktop/src/path/scanline.ts`
- serial sending: `apps/desktop/src/serial/sender.ts`
- firmware implementation: `firmware/esp32/src/*`

## 14. Priority for the next stage

1. keep improving Bluetooth connection stability and long-run drawing stability
2. keep improving custom-multicolor color correction, color fidelity, and real-device appearance
3. keep optimizing drawing paths, command execution paths, and long-run efficiency
4. keep improving user experience, including execution logs, status prompts, recovery UX, packaged desktop install flow, and internal validation guidance
