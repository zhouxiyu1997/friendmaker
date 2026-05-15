import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";

import { readFirmwareFlashPlanFromBuildRoot } from "../scripts/firmware-site.mjs";

test("release-aware flash plan resolution reads files from the provided build root", async (t) => {
  const buildRoot = await mkdtemp(path.join(os.tmpdir(), "friend-maker-flasher-release-root-"));
  const envRoot = path.join(buildRoot, "esp32dev_wireless_switch2");

  t.after(async () => {
    await rm(buildRoot, { recursive: true, force: true });
  });

  await mkdir(path.join(envRoot, "bootloader"), { recursive: true });
  await mkdir(path.join(envRoot, "partition_table"), { recursive: true });
  await writeFile(
    path.join(envRoot, "flasher_args.json"),
    JSON.stringify({
      flash_files: {
        "0x1000": "bootloader/bootloader.bin",
        "0x8000": "partition_table/partition-table.bin",
        "0x10000": "esp32.bin",
      },
    }),
    "utf8",
  );
  await writeFile(path.join(envRoot, "bootloader", "bootloader.bin"), "boot", "utf8");
  await writeFile(path.join(envRoot, "partition_table", "partition-table.bin"), "part", "utf8");
  await writeFile(path.join(envRoot, "esp32.bin"), "firmware", "utf8");

  const flashPlan = await readFirmwareFlashPlanFromBuildRoot(buildRoot, "switch2");

  assert.deepEqual(
    flashPlan.map((part) => ({
      manifestPath: part.manifestPath,
      publishFileName: part.publishFileName,
      sourcePath: path.relative(buildRoot, part.sourcePath),
    })),
    [
      {
        manifestPath: "esp32dev_wireless_switch2/bootloader.bin",
        publishFileName: "bootloader.bin",
        sourcePath: "esp32dev_wireless_switch2/bootloader/bootloader.bin",
      },
      {
        manifestPath: "esp32dev_wireless_switch2/partitions.bin",
        publishFileName: "partitions.bin",
        sourcePath: "esp32dev_wireless_switch2/partition_table/partition-table.bin",
      },
      {
        manifestPath: "esp32dev_wireless_switch2/firmware.bin",
        publishFileName: "firmware.bin",
        sourcePath: "esp32dev_wireless_switch2/esp32.bin",
      },
    ],
  );
});
