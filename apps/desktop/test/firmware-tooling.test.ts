import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPlatformIoPythonDependencyProbeFromProcessResult,
  collectPlatformIoPythonTargets,
  FirmwareToolingManager,
  inspectPlatformIoPythonDependencies,
  parsePlatformIoPythonDependencyProbe,
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

test("parsePlatformIoPythonDependencyProbe marks ready probe results explicitly", () => {
  assert.deepEqual(
    parsePlatformIoPythonDependencyProbe(
      JSON.stringify({
        missingModules: [],
        pyparsingVersion: "2.2.0",
        probeError: null,
      }),
    ),
    {
      state: "ready",
      missingModules: [],
      pyparsingVersion: "2.2.0",
      probeError: null,
    },
  );
});

test("parsePlatformIoPythonDependencyProbe keeps missing dependency details", () => {
  assert.deepEqual(
    parsePlatformIoPythonDependencyProbe(
      JSON.stringify({
        missingModules: ["idf_component_manager", "future"],
        pyparsingVersion: "3.1.4",
        probeError: null,
      }),
    ),
    {
      state: "missing",
      missingModules: ["idf_component_manager", "future"],
      pyparsingVersion: "3.1.4",
      probeError: null,
    },
  );
});

test("buildPlatformIoPythonDependencyProbeFromProcessResult surfaces probe subprocess failures", () => {
  assert.deepEqual(
    buildPlatformIoPythonDependencyProbeFromProcessResult({
      status: 1,
      stdout: "",
      stderr: "Traceback: probe exploded",
    }),
    {
      state: "probe_failed",
      missingModules: [],
      pyparsingVersion: null,
      probeError: "Traceback: probe exploded",
    },
  );
});

test("parsePlatformIoPythonDependencyProbe rejects invalid JSON", () => {
  assert.equal(parsePlatformIoPythonDependencyProbe("not-json"), null);
});

test("issue 69 regression: managed PlatformIO compatibility repair accepts a ready re-probe", async (t) => {
  const appDataRoot = await mkdtemp(path.join(os.tmpdir(), "friend-maker-tooling-manager-"));
  const platformIoPath = path.join(appDataRoot, "tooling", "platformio", "penv", "bin", "pio");
  const logLines: string[] = [];
  let repairCalls = 0;
  let inspectCalls = 0;

  t.after(async () => {
    await rm(appDataRoot, { recursive: true, force: true });
  });

  const manager = new FirmwareToolingManager({
    appDataRoot,
    compatibilityHooks: {
      collectTargets: async () => [
        {
          kind: "penv",
          label: "PlatformIO penv",
          pythonPath: path.join(appDataRoot, "tooling", "platformio", "penv", "bin", "python3"),
        },
      ],
      inspectDependencies: () => {
        inspectCalls += 1;
        if (inspectCalls === 1) {
          return {
            state: "missing",
            missingModules: ["future", "pyparsing"],
            pyparsingVersion: null,
            probeError: null,
          };
        }

        return {
          state: "ready",
          missingModules: [],
          pyparsingVersion: "2.2.0",
          probeError: null,
        };
      },
      repairDependencies: async (_pythonPath, options = {}) => {
        repairCalls += 1;
        options.onLine?.("Successfully installed future pyparsing");
      },
    },
  });

  const compatibility = await manager.ensureManagedPlatformIoCompatibility({
    platformIoPath,
    onLine: (line) => logLines.push(line),
  });

  assert.deepEqual(compatibility, {
    checked: 1,
    repaired: 1,
    targets: [path.join(appDataRoot, "tooling", "platformio", "penv", "bin", "python3")],
  });
  assert.equal(repairCalls, 1);
  assert.match(logLines.join("\n"), /Repairing PlatformIO Python compatibility for PlatformIO penv/);
  assert.match(logLines.join("\n"), /PlatformIO Python compatibility repaired: PlatformIO penv/);
});

test("managed PlatformIO compatibility probe failures stay actionable and still attempt repair", async (t) => {
  const appDataRoot = await mkdtemp(path.join(os.tmpdir(), "friend-maker-tooling-probe-failure-"));
  const platformIoPath = path.join(appDataRoot, "tooling", "platformio", "penv", "bin", "pio");
  const logLines: string[] = [];
  let repairCalls = 0;
  let inspectCalls = 0;

  t.after(async () => {
    await rm(appDataRoot, { recursive: true, force: true });
  });

  const manager = new FirmwareToolingManager({
    appDataRoot,
    compatibilityHooks: {
      collectTargets: async () => [
        {
          kind: "penv",
          label: "PlatformIO penv",
          pythonPath: path.join(appDataRoot, "tooling", "platformio", "penv", "bin", "python3"),
        },
      ],
      inspectDependencies: () => {
        inspectCalls += 1;
        if (inspectCalls === 1) {
          return {
            state: "probe_failed",
            missingModules: [],
            pyparsingVersion: null,
            probeError: "ImportError: probe metadata lookup failed",
          };
        }

        return {
          state: "ready",
          missingModules: [],
          pyparsingVersion: "2.2.0",
          probeError: null,
        };
      },
      repairDependencies: async (_pythonPath, options = {}) => {
        repairCalls += 1;
        options.onLine?.("Reinstalled probe dependencies");
      },
    },
  });

  const compatibility = await manager.ensureManagedPlatformIoCompatibility({
    platformIoPath,
    onLine: (line) => logLines.push(line),
  });

  assert.deepEqual(compatibility, {
    checked: 1,
    repaired: 1,
    targets: [path.join(appDataRoot, "tooling", "platformio", "penv", "bin", "python3")],
  });
  assert.equal(repairCalls, 1);
  assert.match(logLines.join("\n"), /probe failed: ImportError: probe metadata lookup failed/u);
  assert.match(logLines.join("\n"), /PlatformIO Python compatibility repaired: PlatformIO penv/u);
});

test("inspectPlatformIoPythonDependencies requires a real pyparsing import before reporting ready", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "friend-maker-tooling-probe-script-"));

  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const pythonPath = await createMockProbePython(root);
  const probe = inspectPlatformIoPythonDependencies(pythonPath);

  assert.deepEqual(probe, {
    state: "probe_failed",
    missingModules: [],
    pyparsingVersion: null,
    probeError: "RuntimeError: broken pyparsing import",
  });
});

async function createMockProbePython(root: string): Promise<string> {
  const scriptBody = [
    "const args = process.argv.slice(2);",
    "const codeIndex = args.indexOf('-c');",
    "const code = codeIndex >= 0 ? args[codeIndex + 1] ?? '' : '';",
    "const usesMetadata = code.includes(\"importlib_metadata.version('pyparsing')\");",
    "const importsPyparsing = code.includes('import pyparsing');",
    "if (usesMetadata) {",
    "  process.stdout.write(JSON.stringify({ missingModules: [], pyparsingVersion: '2.2.0', probeError: null }));",
    "} else if (importsPyparsing) {",
    "  process.stdout.write(JSON.stringify({",
    "    missingModules: [],",
    "    pyparsingVersion: null,",
    "    probeError: 'RuntimeError: broken pyparsing import',",
    "  }));",
    "} else {",
    "  process.stdout.write(JSON.stringify({",
    "    missingModules: ['pyparsing'],",
    "    pyparsingVersion: null,",
    "    probeError: null,",
    "  }));",
    "}",
  ].join("\n");

  if (process.platform === "win32") {
    const runnerPath = path.join(root, "mock-python.js");
    const commandPath = path.join(root, "mock-python.cmd");
    await writeFile(runnerPath, scriptBody, "utf8");
    await writeFile(commandPath, `@echo off\r\n"${process.execPath}" "%~dp0\\mock-python.js" %*\r\n`, "utf8");
    return commandPath;
  }

  const commandPath = path.join(root, "mock-python");
  await writeFile(commandPath, `#!/usr/bin/env node\n${scriptBody}\n`, "utf8");
  await chmod(commandPath, 0o755);
  return commandPath;
}
