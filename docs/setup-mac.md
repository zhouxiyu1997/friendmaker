# Setup on macOS

## Path note

- Commands in this document assume you are already inside your own local project directory
- Replace serial examples such as `/dev/cu.usbmodemXXXX` or `/dev/cu.SLAB_USBtoUART` with your own device path
- If `pio` is already in your shell `PATH`, you can use `pio ...`; otherwise keep using the full `~/.platformio/penv/bin/pio ...` form

## Prerequisites

- Node.js 22 or newer
- `pnpm` via Corepack, or plain `npm`
- An `ESP32-WROOM-32` / `ESP-32S` development board with USB serial

## Install

```bash
npm install
```

If you prefer `pnpm`, enable it with Corepack first:

```bash
corepack enable
corepack prepare pnpm@10.11.1 --activate
pnpm install
```

## First dry run

```bash
npm run dev -- --image ./examples/demo.svg --preview ./tmp/demo-preview.png --write-commands ./tmp/demo-commands.txt
```

## List serial ports

```bash
npm run dev -- --list-ports
```

## Stream to the board

```bash
npm run dev -- --image ./examples/demo.svg --port <your-serial-port> --send
```

## Flash firmware for ESP32-WROOM-32 / ESP-32S

```bash
pio run -e esp32dev_wireless -t erase --upload-port <your-serial-port>
pio run -e esp32dev_wireless -t upload --upload-port <your-serial-port>
pio device monitor -b 115200
```

If your clone board uploads more reliably as NodeMCU-32S, switch to:

```bash
pio run -e nodemcu_32s_wireless -t erase --upload-port <your-serial-port>
pio run -e nodemcu_32s_wireless -t upload --upload-port <your-serial-port>
pio device monitor -b 115200
```

## Smoke test a fresh board

```bash
npm run dev -- --commands-file ./examples/smoke-test-commands.txt --port <your-serial-port> --send
```

For a step-by-step bring-up flow, see `docs/arrival-checklist.md`.
