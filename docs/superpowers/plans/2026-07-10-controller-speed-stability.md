# Controller Speed and Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce controller discovery latency, prevent avoidable Bluetooth/serial disconnects, and shorten both draw-plan generation and multicolor execution without weakening recovery correctness.

**Architecture:** Keep the existing Electron/local-web → sequenced serial ACK → ESP32 Classic-Bluetooth HID pipeline. Fix races at the serial request boundary, preserve bonds during ordinary Bluetooth restarts, make HID handshake payloads internally consistent, use bounded firmware parsing, interleave color setup with drawing, cap the path planner's expensive component ordering, and persist recovery state only at useful checkpoints through atomic serialized writes.

**Tech Stack:** TypeScript/Node.js 22, Node test runner, SerialPort 13, Sharp, Electron, Arduino + ESP-IDF through PlatformIO, ESP32 Classic Bluetooth HID.

## Global Constraints

- Preserve the raw, unsequenced firmware command fallback used by `pio device monitor`.
- Add no runtime dependency; use Node and ESP-IDF/Arduino APIs already available in the project.
- A serial command advances progress only after the matching session/sequence ACK is received.
- A recovery file may lag inside the currently active color segment, but terminal states and completed color segments must be forced to disk before their API operation completes.
- Ordinary `BT RESET` and `BT RESET LAST-PEER` must preserve the host bond; only `BT CLEAR-PEER` may deliberately forget it.
- Do not add speculative relative palette-slot tracking, a new firmware transport task, or blocking waits inside the HID callback; those require hardware-in-the-loop characterization.
- Keep generated commands compatible with existing saved recovery sessions and the fixed 256×256 canvas model.
- Verify the three production firmware environments: `esp32dev_wireless`, `esp32dev_wireless_switch2`, and `esp32dev_wireless_switch_lite`.

---

### Task 1: Pre-arm serial response waits and report controller readiness accurately

**Files:**
- Modify: `apps/desktop/src/serial/sender.ts:130-665,723-1072`
- Modify: `apps/desktop/src/protocol/sequencing.ts:1-66`
- Modify: `apps/desktop/src/web/server.ts:1400-1480,1629-1708,1900-1985`
- Modify: `apps/desktop/src/web/static/controllerStatus.js:88-212`
- Create: `apps/desktop/test/serial-session-race.test.ts`
- Modify: `apps/desktop/test/controller-status.test.ts:43-153`
- Modify: `apps/desktop/test/three-layer-fix.test.ts:439-480`
- Modify: `apps/desktop/test/web-server-guardrails.test.ts`

**Interfaces:**
- Consumes: existing `parseSequencedAck`, `writeLine`, `ReadlineParser`, and `SerialPort` behavior.
- Produces: `PendingSerialWait<T>`, `writeWithPrearmedWait<T>(startWait, write)`, a cancellable ACK/probe waiter, `validateSerialCommand(command)`, `validateSerialCommandBatch(commands)`, `MAX_SEQUENCED_COMMAND_LENGTH`, and status objects whose `readyValue` is true only when `bt_ready_for_reports=true`.

- [ ] **Step 1: Add failing behavioral tests for fast responses and frame validation**

  Add tests that prove waiter creation happens before a synchronous response emitted from the write callback, that a failed write cancels the pending wait without an unhandled rejection, and that commands containing `\r`, `\n`, `\0`, non-string elements, or more than 256 characters are rejected before execution or recovery persistence:

  ```ts
  test("writeWithPrearmedWait cannot lose a response emitted during write", async () => {
    let resolveWait!: (value: string) => void;
    let armed = false;
    const result = await writeWithPrearmedWait(
      () => {
        armed = true;
        return {
          promise: new Promise<string>((resolve) => { resolveWait = resolve; }),
          cancel: () => undefined,
        };
      },
      async () => {
        assert.equal(armed, true);
        resolveWait("OK");
      },
    );
    assert.equal(result, "OK");
  });

  assert.throws(() => formatSequencedCommand("deadbeef", 1, "I\nBT CLEAR-PEER"), /single line/u);
  assert.throws(() => formatSequencedCommand("deadbeef", 1, `I${"x".repeat(256)}`), /too long/u);
  ```

- [ ] **Step 2: Run the focused tests and confirm the red state**

  Run: `node --import tsx --test apps/desktop/test/serial-session-race.test.ts apps/desktop/test/controller-status.test.ts apps/desktop/test/three-layer-fix.test.ts apps/desktop/test/web-server-guardrails.test.ts`

  Expected: FAIL because `writeWithPrearmedWait` and framing guards do not exist and connected+paired is still inferred as ready.

- [ ] **Step 3: Implement a cancellable waiter that is armed before every write**

  Refactor both sequenced ACK and readiness-probe waits to return this handle, then use the helper for probe writes and normal command writes:

  ```ts
  export interface PendingSerialWait<T> {
    promise: Promise<T>;
    cancel(error?: Error): void;
  }

  export async function writeWithPrearmedWait<T>(
    startWait: () => PendingSerialWait<T>,
    write: () => Promise<void>,
  ): Promise<T> {
    const pending = startWait();
    try {
      const [, response] = await Promise.all([write(), pending.promise]);
      return response;
    } catch (error) {
      pending.cancel(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  ```

  Register parser/port listeners synchronously inside `startWait`. Give `writeLine` a 5,000 ms write/drain deadline so an ACK received before a stuck drain callback cannot leave `Promise.all` pending forever. Preserve session/sequence filtering, input-report failure detection, retry behavior, and `stop()` interruption. The readiness probe accepts only positive unsequenced `OK` responses for its own raw `I`; ignore stale sequenced ACKs and treat unsequenced `ERR` as failure.

- [ ] **Step 4: Bound serial stabilization and shorten the common activity path**

  Make any recognized activity eligible to settle after `SERIAL_OPEN_POST_BOOT_SETTLE_MS`, and enforce `SERIAL_OPEN_BOOT_TIMEOUT_MS` as a hard deadline even if repeated `BOOT` lines keep arriving:

  ```ts
  if (sawActivity && idleMs >= SERIAL_OPEN_POST_BOOT_SETTLE_MS) return;
  if (elapsedMs >= SERIAL_OPEN_BOOT_TIMEOUT_MS) {
    onDeviceLine?.(`WARN serial_session=stabilize_timeout boot_seen=${sawBoot} wait_ms=${SERIAL_OPEN_BOOT_TIMEOUT_MS}`);
    return;
  }
  ```

- [ ] **Step 5: Reject multiline/oversized sequenced commands and stop inferring readiness**

  Add shared validators and call them from `formatSequencedCommand`, `/api/execute`, `/api/execution/start`, and the recovery-session creation path before any command file is written:

  ```ts
  export const MAX_SEQUENCED_COMMAND_LENGTH = 256;
  export function validateSerialCommand(command: unknown): asserts command is string {
    if (typeof command !== "string") throw new Error("Serial commands must be strings.");
    if (/[\r\n\0]/u.test(command)) throw new Error("Serial commands must be a single line.");
    if (command.trim().length === 0) throw new Error("Serial commands cannot be empty.");
    if (command.trim().length > MAX_SEQUENCED_COMMAND_LENGTH) throw new Error("Serial command is too long.");
  }
  ```

  `validateSerialCommandBatch` must reject a non-array or empty array and validate every element. This closes the raw-fallback escape before a malicious newline can be split into a saved `.commands.txt` file.

  In `deriveControllerStatus` and `isControllerSendableStatus`, set readiness from `rawReady === true`; a connected/paired but not-ready link remains `running` or `warning`, never `success`. Treat `discoverableValue === true` as an existing usable broadcast state in `shouldReuseExistingControllerConnection` so clicking Connect does not restart an already advertising stack.

- [ ] **Step 6: Run focused tests and commit**

  Run: `node --import tsx --test apps/desktop/test/serial-session-race.test.ts apps/desktop/test/controller-status.test.ts apps/desktop/test/three-layer-fix.test.ts apps/desktop/test/web-server-guardrails.test.ts`

  Expected: PASS with no open handle or unhandled rejection warning.

  ```bash
  git add apps/desktop/src/serial/sender.ts apps/desktop/src/protocol/sequencing.ts apps/desktop/src/web/server.ts apps/desktop/src/web/static/controllerStatus.js apps/desktop/test/serial-session-race.test.ts apps/desktop/test/controller-status.test.ts apps/desktop/test/three-layer-fix.test.ts apps/desktop/test/web-server-guardrails.test.ts
  git commit -m "fix: prearm serial acknowledgements"
  ```

---

### Task 2: Preserve Bluetooth bonds and make HID handshake replies consistent

**Files:**
- Modify: `firmware/esp32/src/classic_bt_controller_transport.cpp:23-279,297-557,799-855,1158-1324,1349-1443`
- Modify: `firmware/esp32/src/classic_bt_controller_transport.h:20-112`
- Modify: `apps/desktop/test/firmware-flash.test.ts:149-239,390-416`

**Interfaces:**
- Consumes: ESP-IDF Classic Bluetooth HID callbacks and the eFuse-derived base address established before Bluetooth startup.
- Produces: 48-byte subcommand-reply invariants, a device-info reply patched once after Bluetooth enable from `esp_bt_dev_get_address()`, bond-preserving stack shutdown, and monotonic report counters across pairing.

- [ ] **Step 1: Add failing source-contract tests for reset, payload length, identity, and pairing order**

  Assert all of the following in `firmware-flash.test.ts`:

  ```ts
  assert.doesNotMatch(shutdownBody, /virtual_cable_unplug/u);
  assert.match(clearPeerBody, /esp_bt_hid_device_virtual_cable_unplug/u);
  assert.match(firmwareSource, /kSubcommandReplyLength\s*=\s*48/u);
  assert.match(firmwareSource, /static_assert\(sizeof\(kReplySpiAddress0\) == kSubcommandReplyLength/u);
  assert.match(firmwareSource, /static_assert\(sizeof\(kReply3333\) == kSubcommandReplyLength/u);
  assert.match(firmwareSource, /esp_bt_dev_get_address\(\)[\s\S]*kReply02/u);
  assert.match(firmwareSource, /if \(sendSubcommandReply\([^;]+"reply03"\) && kMarkPairedOnSubcommand03\)/u);
  assert.doesNotMatch(markPairedBody, /resetInputReportTracking/u);
  assert.doesNotMatch(beginExplicitInputBody, /inputReportSubmitCount_\s*=\s*inputReportSendEventCount_/u);
  ```

- [ ] **Step 2: Run the focused firmware contract tests and confirm the red state**

  Run: `node --import tsx --test apps/desktop/test/firmware-flash.test.ts`

  Expected: FAIL because ordinary shutdown unplugs the virtual cable, two replies have the wrong size, the MAC is hard-coded, pairing ignores reply submission, and counters are rewound.

- [ ] **Step 3: Separate disconnect from deliberate peer forgetting**

  Remove `esp_bt_hid_device_virtual_cable_unplug()` from `shutdownClassicBluetooth()` so both reset variants preserve bonds. In `clearStoredPeer()`, request VC unplug as a best-effort explicit forget operation, log its return value, then remove bonded devices and the persisted peer key. Do not block inside a HID callback or claim callback completion that has not occurred.

- [ ] **Step 4: Enforce 48-byte report-0x21 payloads and patch the actual Bluetooth MAC**

  Add these invariants beside the reply arrays:

  ```cpp
  constexpr size_t kSubcommandReplyLength = 48;
  constexpr size_t kReply02BluetoothAddressOffset = 18;
  static_assert(sizeof(kReply02) == kSubcommandReplyLength, "reply02 must match HID report 0x21");
  static_assert(sizeof(kReplySpiAddress0) == kSubcommandReplyLength, "replyspi0 must match HID report 0x21");
  static_assert(sizeof(kReply3333) == kSubcommandReplyLength, "reply3333 must match HID report 0x21");
  ```

  Add one trailing zero to `kReplySpiAddress0`, remove one zero from the padding immediately before the final `0x7b, 0x00` suffix in `kReply3333`, and patch `kReply02[18..23]` once after `esp_bluedroid_enable()` from `esp_bt_dev_get_address()`, using the same direct byte order as the repository's earlier dynamic-MAC implementation. Fail Bluetooth initialization with an actionable log if the stack exposes no address. Do not perform the mutation inside `ESP_HIDD_INTR_DATA_EVT`; this avoids reintroducing reply-time work from historical commit `f789829`.

- [ ] **Step 5: Make pairing flags depend on successful enqueue and keep report counters monotonic**

  Change subcommands 0x03, 0x30, and 0x21/0x21 to call `markControllerPaired()` only when `sendSubcommandReply(...)` returns true. Change the success log from `reply` to `reply queued`. Remove `resetInputReportTracking()` from `markControllerPaired()` and never assign submit count backwards in `beginExplicitInput`; if a conservative profile cannot drain an outstanding report within its existing budget, fail the explicit input instead of hiding the pending callback. Keep the standard profile's existing wait/drain flags unchanged until HIL measurements justify changing them.

- [ ] **Step 6: Run focused tests and commit**

  Run: `node --import tsx --test apps/desktop/test/firmware-flash.test.ts`

  Expected: PASS.

  ```bash
  git add firmware/esp32/src/classic_bt_controller_transport.cpp firmware/esp32/src/classic_bt_controller_transport.h apps/desktop/test/firmware-flash.test.ts
  git commit -m "fix: preserve bluetooth pairing state"
  ```

---

### Task 3: Reject dangerous or unbounded firmware command parameters

**Files:**
- Modify: `firmware/esp32/src/protocol.cpp:3-263,415-679`
- Modify: `firmware/esp32/src/config.h:5-42`
- Modify: `apps/desktop/test/firmware-flash.test.ts`

**Interfaces:**
- Consumes: the existing text commands `M`, `L`, `W`, `PC`, `BC`, `HOLD`, `TAP`, `STICK`, and `CFG INPUT`.
- Produces: strict decimal/hex token parsing and fixed limits `MAX_CURSOR_DELTA=255`, `MAX_WAIT_DURATION_MS=60000`, and valid palette ranges.

- [ ] **Step 1: Add failing source-contract tests for strict parsing and bounds**

  Add assertions that the parser uses a full-token `strtol` check, rejects negative waits, bounds cursor deltas before `abs`, validates all six hex digits, and rejects palette coordinates outside the firmware constants:

  ```ts
  assert.match(protocolSource, /parseStrictIntToken[\s\S]*end == token\.c_str\(\)[\s\S]*\*end != '\\0'/u);
  assert.match(protocolSource, /delayMs < 0 \|\| delayMs > MAX_WAIT_DURATION_MS/u);
  assert.match(protocolSource, /abs\(dx\) > MAX_CURSOR_DELTA \|\| abs\(dy\) > MAX_CURSOR_DELTA/u);
  assert.match(protocolSource, /isxdigit/u);
  assert.match(protocolSource, /slotIndex < 0 \|\| slotIndex >= COLOR_PALETTE_SLOT_COUNT/u);
  assert.match(protocolSource, /row < 0 \|\| row >= BASIC_COLOR_GRID_ROWS/u);
  ```

- [ ] **Step 2: Run the focused test and confirm the red state**

  Run: `node --import tsx --test apps/desktop/test/firmware-flash.test.ts`

  Expected: FAIL because `String::toInt()` currently accepts malformed tokens and `W -1` reaches `delay()`.

- [ ] **Step 3: Implement strict token parsing and command-specific limits**

  Use `strtol` with `errno`, `INT_MIN/INT_MAX`, and full-end-pointer validation. Reject extra tokens rather than letting `toInt()` ignore them. Before executing commands, enforce:

  ```cpp
  if (dx < -MAX_CURSOR_DELTA || dx > MAX_CURSOR_DELTA ||
      dy < -MAX_CURSOR_DELTA || dy > MAX_CURSOR_DELTA) {
    error = "move out of range";
    return false;
  }
  if (delayMs < 0 || delayMs > MAX_WAIT_DURATION_MS) {
    error = "invalid wait";
    return false;
  }
  ```

  Validate PC slots as 0..8, BC rows as 0..6 and columns as 0..11 before any cast, and require every hex character to pass `isxdigit` before `strtol`.

- [ ] **Step 4: Run focused tests and commit**

  Run: `node --import tsx --test apps/desktop/test/firmware-flash.test.ts`

  Expected: PASS.

  ```bash
  git add firmware/esp32/src/protocol.cpp firmware/esp32/src/config.h apps/desktop/test/firmware-flash.test.ts
  git commit -m "fix: bound firmware command inputs"
  ```

---

### Task 4: Remove quadratic path planning and redundant multicolor selection

**Files:**
- Modify: `apps/desktop/src/path/scanline.ts:53-59,340-426,945-1047`
- Modify: `apps/desktop/src/web/server.ts:1310-1385`
- Modify: `apps/desktop/src/web/static/app.js:1541-1560`
- Modify: `apps/desktop/test/path-optimization.test.ts`
- Modify: `apps/desktop/test/recovery.test.ts:172-333`
- Modify: `apps/desktop/test/preview-layout.test.ts`
- Modify: `apps/desktop/test/timing-config.test.ts`

**Interfaces:**
- Consumes: `PC`/`BC` firmware behavior that applies the configured slot and returns to the canvas, and the existing per-color `ResumeSegment` model.
- Produces: `selectComponentOrderingStrategy(componentCount)`, a linearithmic serpentine fallback above 2,048 disconnected components, interleaved configure→settle→draw segments, and a bounded UI preview scale of 2.

- [ ] **Step 1: Add failing tests for planner selection and multicolor command order**

  Add a pure strategy test and command-order tests:

  ```ts
  assert.equal(selectComponentOrderingStrategy(2048), "greedy");
  assert.equal(selectComponentOrderingStrategy(2049), "serpentine");

  const commands = serializeCommands(generateScanlinePlan(pixelMap, paletteProfile).commands);
  assert.deepEqual(commands.filter((command) => /^(?:PC|C |W 500)/u.test(command)), [
    "PC 0 #FF0000",
    "W 500",
    "PC 1 #00FF00",
    "W 500",
    "PC 2 #0000FF",
    "W 500",
  ]);
  ```

  For official mode, expect `BC RESET` once followed by each `BC` and `W 500` immediately before that color's drawing body, with no generated `C n`. Assert each recovery prefix contains brush setup plus only `PC slot color` and `W 500`, or brush setup plus `BC RESET`, only `BC slot row col`, and `W 500`.

- [ ] **Step 2: Run path/recovery tests and confirm the red state**

  Run: `node --import tsx --test apps/desktop/test/path-optimization.test.ts apps/desktop/test/recovery.test.ts apps/desktop/test/preview-layout.test.ts apps/desktop/test/timing-config.test.ts`

  Expected: FAIL because large component sets choose the quadratic greedy loop, all batch colors are configured before drawing, each color emits a redundant `C`, and the UI asks for scale 12.

- [ ] **Step 3: Add a deterministic fallback before the quadratic greedy loop**

  Export and use:

  ```ts
  export const MAX_GREEDY_COMPONENT_COUNT = 2_048;
  export function selectComponentOrderingStrategy(componentCount: number): "exact" | "greedy" | "serpentine" {
    if (componentCount <= EXACT_COMPONENT_ORDER_LIMIT) return "exact";
    return componentCount <= MAX_GREEDY_COMPONENT_COUNT ? "greedy" : "serpentine";
  }
  ```

  Preserve the existing exact-order pixel-count guard. For more than 2,048 components, return the already computed best serpentine order without calling `greedyComponentOrder` or doing a second full travel comparison. Apply the same large-component fallback to the optional nearest-neighbor strategy so a checkerboard cannot enter its `O(k²)` component scan.

- [ ] **Step 4: Interleave palette configuration and drawing**

  For each palette color, emit its `paletteConfigCommand(slotIndex, colorHex)` immediately before `appendResumeSegment`; do not emit `colorCommand` because PC applies the slot. Preserve `W 500` and suppress the first post-configuration recenter until HIL proves the PC ACK alone implies a settled canvas. For official colors, emit one initial `BC RESET`, then one `basicPaletteConfigCommand` and `W 500` immediately before its segment; BC applies the slot. Keep slot reuse in batches of nine. Build resume prefixes as:

  ```ts
  resumePrefixCommands: [
    ...brushSetupCommands,
    paletteConfigCommand(slotIndex, color.colorHex),
    waitCommand(COLOR_SELECT_CANVAS_SETTLE_WAIT_MS),
  ]
  // official:
  resumePrefixCommands: [
    ...brushSetupCommands,
    basicPaletteResetCommand(),
    basicPaletteConfigCommand(slotIndex, cell.row, cell.col),
    waitCommand(COLOR_SELECT_CANVAS_SETTLE_WAIT_MS),
  ]
  ```

- [ ] **Step 5: Bound the interactive preview to scale 2**

  Change `buildStudioGeneratePayload().previewScale` from 12 to 2. In the web server, normalize external `previewScale` to an integer in the range 1..4 before calling `generateDrawPlan`. Leave CLI/export defaults unchanged so explicit high-resolution output remains available.

- [ ] **Step 6: Run focused tests and a worst-case benchmark**

  Run: `node --import tsx --test apps/desktop/test/path-optimization.test.ts apps/desktop/test/recovery.test.ts apps/desktop/test/preview-layout.test.ts apps/desktop/test/timing-config.test.ts`

  Expected: PASS.

  Run a 256×256 one-color checkerboard benchmark through `generateScanlinePlan`; record wall time, command count, and estimated runtime before/after in the implementer report. Expected after the change: planner completes in under 2 seconds on the current machine and does not enter `greedyComponentOrder`.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/desktop/src/path/scanline.ts apps/desktop/src/web/server.ts apps/desktop/src/web/static/app.js apps/desktop/test/path-optimization.test.ts apps/desktop/test/recovery.test.ts apps/desktop/test/preview-layout.test.ts apps/desktop/test/timing-config.test.ts
  git commit -m "perf: streamline multicolor draw planning"
  ```

---

### Task 5: Make recovery persistence atomic and checkpoint-based

**Files:**
- Modify: `apps/desktop/src/web/recoverySessions.ts:1-355`
- Modify: `apps/desktop/src/web/server.ts:220-265,1245-1268,1512-1626,1665-1682`
- Modify: `apps/desktop/test/recovery.test.ts`

**Interfaces:**
- Consumes: mutable `RecoverySessionRecord`, per-color `lastCompletedSegmentIndex`, and terminal execution status updates.
- Produces: serialized atomic `writeSession(record)` and a `lastPersistedRecoverySegmentIndex` field on `ManagedExecution`.

- [ ] **Step 1: Add failing atomicity, serialization, and checkpoint tests**

  Add a test that starts two writes for the same job in call order and verifies the second JSON snapshot wins, that no `*.tmp-*` file remains, and that a simulated multi-command color segment does not call `writeSession` once per ACK. Assert a segment transition and pause/stop/completion each force the latest record to disk.

  ```ts
  await Promise.all([store.writeSession(firstSnapshot), store.writeSession(secondSnapshot)]);
  assert.equal((await store.loadSession(record.jobId)).completedCommands, 2);
  assert.equal((await readdir(root)).some((name) => name.includes(".tmp-")), false);
  ```

- [ ] **Step 2: Run recovery tests and confirm the red state**

  Run: `node --import tsx --test apps/desktop/test/recovery.test.ts`

  Expected: FAIL because writes target the final JSON directly and every ACK awaits a complete rewrite.

- [ ] **Step 3: Serialize atomic resume-file writes**

  Capture JSON text at method entry, chain writes per job ID, write a unique sibling temp file, and rename it over the final path:

  ```ts
  const serialized = `${JSON.stringify(record, null, 2)}\n`;
  const previous = this.writeChains.get(record.jobId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const tempPath = `${finalPath}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
    try {
      await writeFile(tempPath, serialized, "utf8");
      await rename(tempPath, finalPath);
    } finally {
      await rm(tempPath, { force: true });
    }
  });
  ```

  Remove the completed chain from the map only if the stored promise is still `next`.

- [ ] **Step 4: Persist progress at segment checkpoints, and force terminal writes**

  Update the in-memory record on every ACK. Write it only when `lastCompletedSegmentIndex` changes; update `lastPersistedRecoverySegmentIndex` after a successful write. `updateRecoverySessionStatus` always calls `writeSession`, so pause, resume, recoverable, stopped, failed, and completed states flush the latest progress. This is safe because recovery always redraws the unfinished segment from its first paint command.

- [ ] **Step 5: Run focused tests and commit**

  Run: `node --import tsx --test apps/desktop/test/recovery.test.ts`

  Expected: PASS, including restart/recovery API tests.

  ```bash
  git add apps/desktop/src/web/recoverySessions.ts apps/desktop/src/web/server.ts apps/desktop/test/recovery.test.ts
  git commit -m "perf: checkpoint recovery state atomically"
  ```

---

### Task 6: Integrate, compile firmware, and prepare the pull request

**Files:**
- Modify only if verification exposes a defect in files already touched by Tasks 1-5.

**Interfaces:**
- Consumes: all task commits.
- Produces: a green branch and a draft PR against `main` with measured impact and explicit HIL follow-ups.

- [ ] **Step 1: Run the complete local test/build suite**

  Run: `npm run ci:local:quick`

  Expected: TypeScript checks pass; all desktop and flasher tests pass; the flasher web build completes.

- [ ] **Step 2: Compile all production firmware variants**

  Run:

  ```bash
  python3 -m platformio run -d firmware/esp32 -e esp32dev_wireless
  python3 -m platformio run -d firmware/esp32 -e esp32dev_wireless_switch2
  python3 -m platformio run -d firmware/esp32 -e esp32dev_wireless_switch_lite
  ```

  Expected: all three environments finish with `SUCCESS`. If PlatformIO is absent, install it in an isolated user environment and rerun the same commands; do not skip firmware compilation.

- [ ] **Step 3: Review the complete branch diff and run secret checks**

  Run:

  ```bash
  git diff --check main...HEAD
  git status --short
  git diff --stat main...HEAD
  git diff main...HEAD | rg -n "(ghp_|github_pat_|AKIA|BEGIN (RSA|OPENSSH|EC) PRIVATE KEY)" || true
  ```

  Expected: no whitespace errors, only intended plan/code/test changes, and no credential match.

- [ ] **Step 4: Push and open a draft PR**

  Push `codex/optimize-controller-speed-stability`, then create a draft PR to `main`. The PR body must include: serial ACK race root cause; bond-preserving reset; HID payload/MAC fixes; strict firmware input limits; checkerboard planner benchmark; removed redundant `C` count and estimated time savings while retaining `W 500`; atomic recovery checkpoint behavior; exact commands run; and HIL items not changed (async subcommand completion, standard-profile send-event waiting, removing the post-color settle wait, truly interruptible long firmware commands, relative palette tracking).
