import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  collectPlatformIoPythonTargets,
  parsePlatformIoPythonDependencyStatus,
} from "../src/web/firmwareTooling.js";

test("collectPlatformIoPythonTargets finds penv plus ESP-IDF virtualenv interpreters", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "friend-maker-tooling-"));
  const penvRoot = path.join(root, "penv");
  const penvBin = path.join(penvRoot, "bin");
  const espidf447Root = path.join(penvRoot, ".espidf-4.4.7");
  const espidf50Root = path.join(penvRoot, ".espidf-5.0.0");

  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await mkdir(penvBin, { recursive: true });
  await mkdir(path.join(espidf447Root, "bin"), { recursive: true });
  await mkdir(path.join(espidf50Root, "bin"), { recursive: true });
  await writeFile(path.join(penvBin, "pio"), "", "utf8");
  await writeFile(path.join(penvBin, "python3"), "", "utf8");
  await writeFile(path.join(espidf447Root, "bin", "python3"), "", "utf8");
  await writeFile(path.join(espidf50Root, "bin", "python3"), "", "utf8");

  const targets = await collectPlatformIoPythonTargets(path.join(penvBin, "pio"));

  assert.deepEqual(
    targets.map((target) => ({ kind: target.kind, label: target.label })),
    [
      { kind: "penv", label: "PlatformIO penv" },
      { kind: "espidf", label: ".espidf-4.4.7" },
      { kind: "espidf", label: ".espidf-5.0.0" },
    ],
  );
  assert.deepEqual(
    targets.map((target) => target.pythonPath),
    [
      path.join(penvBin, "python3"),
      path.join(espidf447Root, "bin", "python3"),
      path.join(espidf50Root, "bin", "python3"),
    ],
  );
});

test("parsePlatformIoPythonDependencyStatus normalizes JSON probe output", () => {
  assert.deepEqual(
    parsePlatformIoPythonDependencyStatus(
      JSON.stringify({
        missingModules: ["idf_component_manager", "future"],
        pyparsingVersion: "3.1.4",
      }),
    ),
    {
      missingModules: ["idf_component_manager", "future"],
      pyparsingVersion: "3.1.4",
    },
  );

  assert.equal(parsePlatformIoPythonDependencyStatus("not-json"), null);
});
