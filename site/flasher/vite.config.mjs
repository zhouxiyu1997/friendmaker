import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import {
  createFirmwareManifest,
  readFirmwareFlashPlan,
} from "./scripts/firmware-site.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function firmwareDevPlugin() {
  return {
    name: "friend-maker-firmware-dev",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = request.url?.split("?")[0] ?? "";

        if (url === "/firmware/manifest.json") {
          try {
            const manifest = await createFirmwareManifest();
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(`${JSON.stringify(manifest, null, 2)}\n`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            response.statusCode = 503;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(`${JSON.stringify({ error: message }, null, 2)}\n`);
          }
          return;
        }

        const match = /^\/firmware\/esp32dev_wireless\/([^/]+)$/u.exec(url);
        if (!match?.[1]) {
          next();
          return;
        }

        const firmwareParts = await readFirmwareFlashPlan();
        const part = firmwareParts.find((entry) => entry.publishFileName === match[1]);
        if (!part) {
          response.statusCode = 404;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(`${JSON.stringify({ error: `Unknown firmware file: ${match[1]}` })}\n`);
          return;
        }

        if (!existsSync(part.sourcePath)) {
          response.statusCode = 404;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(`${JSON.stringify({ error: `Missing firmware file: ${part.publishFileName}` })}\n`);
          return;
        }

        try {
          const content = await readFile(part.sourcePath);
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/octet-stream");
          response.end(content);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(`${JSON.stringify({ error: message })}\n`);
        }
      });
    },
  };
}

export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [firmwareDevPlugin()],
  build: {
    outDir: path.resolve(__dirname, "dist", "web"),
    emptyOutDir: true,
  },
});
