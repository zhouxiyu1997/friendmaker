import test from "node:test";
import assert from "node:assert/strict";

import { buildFirmwareFlashPlanFromArgs } from "../scripts/firmware-site.mjs";

test("flash plan normalization keeps legacy public filenames stable and sorts by offset", () => {
  const flasherArgs = {
    flash_files: {
      "0x10000": "esp32.bin",
      "0x8000": "partition_table/partition-table.bin",
      "0xe000": "boot_app0.bin",
      "0x1000": "bootloader/bootloader.bin",
    },
  };

  assert.deepEqual(buildFirmwareFlashPlanFromArgs(flasherArgs), [
    {
      offset: 0x1000,
      publishFileName: "bootloader.bin",
      sourceRelativePath: "bootloader/bootloader.bin",
    },
    {
      offset: 0x8000,
      publishFileName: "partitions.bin",
      sourceRelativePath: "partition_table/partition-table.bin",
    },
    {
      offset: 0xe000,
      publishFileName: "boot-app0.bin",
      sourceRelativePath: "boot_app0.bin",
    },
    {
      offset: 0x10000,
      publishFileName: "firmware.bin",
      sourceRelativePath: "esp32.bin",
    },
  ]);
});
