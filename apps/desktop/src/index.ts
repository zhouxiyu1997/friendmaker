import { readFile, writeFile } from "node:fs/promises";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline";

import { generateDrawPlan } from "./app/generateDrawPlan.js";
import { applyCliOptions, parseCliArgs, printHelp } from "./cli/args.js";
import { loadProfile } from "./config/loadProfile.js";
import { listPorts } from "./serial/listPorts.js";
import { SerialAckSender } from "./serial/sender.js";
import { SimulatedAckSender } from "./simulator/sender.js";
import type { SenderControls } from "./types.js";
import { ensureParentDirectory } from "./utils/fs.js";

function formatDuration(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}m ${seconds}s`;
}

function installInteractiveControls(sender: SenderControls): () => void {
  if (!input.isTTY) {
    return () => {};
  }

  readline.emitKeypressEvents(input, undefined);
  input.setRawMode(true);

  let paused = false;

  const onKeypress = (_: string, key: { ctrl?: boolean; name?: string }) => {
    if (key.ctrl && key.name === "c") {
      sender.stop();
      return;
    }

    if (key.name === "p") {
      paused = !paused;

      if (paused) {
        sender.pause();
        output.write("\n[serial] paused\n");
      } else {
        sender.resume();
        output.write("\n[serial] resumed\n");
      }
    }

    if (key.name === "q") {
      sender.stop();
      output.write("\n[serial] stop requested\n");
    }
  };

  input.on("keypress", onKeypress);
  output.write("Interactive controls: press p to pause/resume, q to stop.\n");

  return () => {
    input.off("keypress", onKeypress);
    input.setRawMode(false);
  };
}

async function loadCommandsFile(commandsFile: string): Promise<string[]> {
  const content = await readFile(commandsFile, "utf8");

  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2));

  if (cli.help || process.argv.length <= 2) {
    console.log(printHelp());
    return;
  }

  if (cli.listPorts) {
    const ports = await listPorts();

    if (ports.length === 0) {
      console.log("No serial ports found.");
      return;
    }

    console.log(ports.join("\n"));
    return;
  }

  if (cli.image && cli.commandsFile) {
    throw new Error("Use either --image or --commands-file, not both.");
  }

  if (cli.simulateDevice && cli.port) {
    throw new Error("Use either --port or --simulate-device, not both.");
  }

  const profile = applyCliOptions(await loadProfile(cli.profile), cli);
  let serializedCommands: string[];

  if (cli.commandsFile) {
    serializedCommands = await loadCommandsFile(cli.commandsFile);

    if (serializedCommands.length === 0) {
      throw new Error(`No commands found in ${cli.commandsFile}`);
    }

    console.log(
      [
        `Profile: ${profile.profileName}`,
        `Command source: file`,
        `Commands file: ${cli.commandsFile}`,
        `Commands: ${serializedCommands.length}`,
      ].join("\n"),
    );
  } else {
    if (!cli.image) {
      throw new Error("Missing required argument: --image or --commands-file");
    }

    const plan = await generateDrawPlan(cli.image, profile, cli.previewScale);
    serializedCommands = plan.commands;

    if (cli.preview) {
      await ensureParentDirectory(cli.preview);
      await writeFile(cli.preview, plan.previewPng);
    }

    if (cli.writeCommands) {
      await ensureParentDirectory(cli.writeCommands);
      await writeFile(cli.writeCommands, `${serializedCommands.join("\n")}\n`, "utf8");
    }

    console.log(
      [
        `Profile: ${profile.profileName}`,
        `Canvas: ${profile.canvasWidth}x${profile.canvasHeight}`,
        `Brush: ${profile.brushSize}`,
        `Mode: ${profile.colorMode}`,
        `Palette: ${profile.palette.join(", ")}`,
        `Used colors: ${plan.usedColorIndexes.join(", ")}`,
        `Pixels: ${plan.totalPixels}`,
        `Commands: ${serializedCommands.length}`,
        `Estimated runtime: ${formatDuration(plan.estimatedRuntimeMs)}`,
        `Max move: ${plan.pathStats.maxMoveSteps} steps (${plan.pathStats.maxMoveDx}, ${plan.pathStats.maxMoveDy})`,
        `Long moves: >50=${plan.pathStats.movesOver50}, >100=${plan.pathStats.movesOver100}, >200=${plan.pathStats.movesOver200}`,
        `Reanchors: ${plan.pathStats.reanchorCount}`,
        cli.preview ? `Preview: ${cli.preview}` : undefined,
        cli.writeCommands ? `Commands file: ${cli.writeCommands}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (!cli.send) {
    console.log(
      "\nDry run complete. Add --send --port <device> or --send --simulate-device to execute commands.",
    );
    return;
  }

  if (!cli.port && !cli.simulateDevice) {
    throw new Error("Missing required execution target: use --port <device> or --simulate-device");
  }

  const sender = cli.simulateDevice ? new SimulatedAckSender() : new SerialAckSender();
  const cleanupControls = installInteractiveControls(sender);

  try {
    const commonOptions = {
      ackTimeoutMs: profile.ackTimeoutMs,
      retries: profile.commandRetryCount,
      buttonPressMs: profile.buttonPressDuration,
      inputDelayMs: profile.inputDelay,
      homeMs: profile.homeDuration,
      onProgress: ({ index, total, command }: { index: number; total: number; command: string }) => {
        output.write(`\r[serial] ${index}/${total} ${command}      `);
      },
      onDeviceLine: (line: string) => {
        output.write(`\n[device] ${line}\n`);
      },
    };

    if (sender instanceof SimulatedAckSender) {
      await sender.send(serializedCommands, {
        ...commonOptions,
        ackDelayMs: cli.simulateAckDelay ?? 15,
        ...(cli.simulateErrorAt !== undefined
          ? { errorAtCommand: cli.simulateErrorAt }
          : {}),
      });
      output.write("\nSimulated send finished.\n");
    } else {
      await sender.send(serializedCommands, {
        ...commonOptions,
        path: cli.port ?? "",
        baudRate: profile.baudRate,
      });
      output.write("\nSerial send finished.\n");
    }
  } finally {
    cleanupControls();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
