import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const webStaticRoot = path.resolve("apps/desktop/src/web/static");
const electronRoot = path.resolve("apps/desktop/src/electron");

function readPxValue(source: string, pattern: RegExp, label: string): number {
  const match = pattern.exec(source);
  const value = match?.[1];
  assert.ok(value, `Missing ${label}`);
  return Number(value);
}

function readCssBlock(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, "u").exec(source);
  const block = match?.[1];
  assert.ok(block, `Missing ${selector} CSS block`);
  return block;
}

function readStudioColumnMinimums(appSource: string): number[] {
  const constants = new Map<string, number>();
  for (const match of appSource.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*(\d+);/gu)) {
    const name = match[1];
    const value = match[2];

    if (name && value) {
      constants.set(name, Number(value));
    }
  }

  const studioColumnsMatch = /studio:\s*\{[\s\S]*?columns:\s*\{[\s\S]*?minPixels:\s*\[([^\]]+)\]/u.exec(appSource);
  const minimums = studioColumnsMatch?.[1];
  assert.ok(minimums, "Missing studio column minimums");

  return minimums
    .split(",")
    .map((part) => part.trim())
    .map((part) => constants.get(part) ?? Number(part));
}

test("studio layout fits the Electron minimum window without horizontal page overflow", async () => {
  const [indexSource, stylesSource, appSource, electronSource] = await Promise.all([
    readFile(path.join(webStaticRoot, "index.html"), "utf8"),
    readFile(path.join(webStaticRoot, "styles.css"), "utf8"),
    readFile(path.join(webStaticRoot, "app.js"), "utf8"),
    readFile(path.join(electronRoot, "main.ts"), "utf8"),
  ]);

  assert.match(indexSource, /<div class="preview-column">[\s\S]*<section class="panel panel-preview">/u);
  assert.match(indexSource, /<section id="official-palette-panel" class="panel panel-official-palette hidden">/u);

  const electronMinWidth = readPxValue(electronSource, /minWidth:\s*(\d+)/u, "Electron minWidth");
  const sidebarWidth = readPxValue(stylesSource, /--sidebar-width:\s*(\d+)px;/u, "sidebar width");
  const splitterSize = readPxValue(stylesSource, /--splitter-size:\s*(\d+)px;/u, "splitter size");
  const gridPadding = readPxValue(readCssBlock(stylesSource, ".grid,\n.firmware-grid,\n.controller-grid"), /padding:\s*(\d+)px;/u, "grid padding");
  const studioColumnMinimums = readStudioColumnMinimums(appSource);
  const studioMinimumWidth =
    studioColumnMinimums.reduce((sum, value) => sum + value, 0)
    + splitterSize * 2
    + gridPadding * 2;
  const workspaceMinimumWidth = electronMinWidth - sidebarWidth;

  assert.deepEqual(studioColumnMinimums, [260, 300, 150]);
  assert.ok(
    studioMinimumWidth <= workspaceMinimumWidth,
    `Studio minimum ${studioMinimumWidth}px exceeds workspace minimum ${workspaceMinimumWidth}px`,
  );

  assert.match(stylesSource, /--studio-preview-column-min:\s*300px;/u);
  assert.match(stylesSource, /\.workspace-content\s*\{[\s\S]*overflow:\s*hidden;/u);
  assert.doesNotMatch(stylesSource, /\.workspace-content\s*\{[\s\S]*overflow-x:\s*auto;/u);
  assert.match(stylesSource, /\.page\[data-page="studio"\]\s*\{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*overflow:\s*hidden;/u);
  assert.doesNotMatch(stylesSource, /\.page\[data-page="studio"\]\s*\{[\s\S]*width:\s*max-content;/u);
  assert.match(stylesSource, /\.grid\s*\{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*minmax\(260px,\s*var\(--layout-studio-col-1,\s*0\.95fr\)\)[\s\S]*minmax\(var\(--studio-preview-column-min\),\s*var\(--layout-studio-col-2,\s*1fr\)\)[\s\S]*minmax\(150px,\s*var\(--layout-studio-col-3,\s*0\.82fr\)\)/u);
  assert.doesNotMatch(stylesSource, /\.grid\s*\{[\s\S]*width:\s*max-content;/u);
  assert.match(stylesSource, /\.preview-column\s*\{[\s\S]*min-width:\s*0;[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/u);
  assert.match(stylesSource, /\.panel-preview,\s*\.panel-official-palette\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*overflow:\s*visible;/u);
  assert.match(stylesSource, /\.panel-preview\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/u);
  assert.match(stylesSource, /\.preview-frame\s*\{[\s\S]*width:\s*min\(100%,\s*calc\(520px \+ 24px\)\);[\s\S]*max-width:\s*100%;[\s\S]*aspect-ratio:\s*1;/u);
  assert.match(stylesSource, /\.preview-canvas\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*520px;[\s\S]*aspect-ratio:\s*1;/u);
  assert.doesNotMatch(stylesSource, /\.preview-canvas\s*\{[\s\S]*height:\s*520px;/u);
  assert.match(stylesSource, /\.preview-canvas > img\s*\{[\s\S]*object-fit:\s*fill;/u);
  assert.doesNotMatch(stylesSource, /--preview-canvas-size/u);
  assert.doesNotMatch(appSource, /computePreviewCanvasSize/u);
  assert.doesNotMatch(appSource, /initializePreviewCanvasLayout/u);
  assert.doesNotMatch(appSource, /schedulePreviewCanvasLayoutSync/u);
  assert.match(appSource, /const STUDIO_PREVIEW_COLUMN_MIN_PX = 300;/u);
  assert.match(appSource, /minPixels:\s*\[260,\s*STUDIO_PREVIEW_COLUMN_MIN_PX,\s*150\]/u);
  assert.match(appSource, /function buildStudioGeneratePayload\(\)[\s\S]*?previewScale:\s*2,/u);
  assert.doesNotMatch(appSource, /function buildStudioGeneratePayload\(\)[\s\S]*?previewScale:\s*12,/u);
});

test("page switches reset the shared preview column scroll state", async () => {
  const appSource = await readFile(path.join(webStaticRoot, "app.js"), "utf8");

  assert.match(appSource, /workspaceContent:\s*document\.querySelector\("\.workspace-content"\)/u);
  assert.match(appSource, /workspaceContent\?\.scrollTo\?\.\(\{\s*left:\s*0,\s*top:\s*0,\s*behavior:\s*"smooth"\s*\}\)/u);
  assert.match(appSource, /workspaceContent\s*&&\s*\(els\.workspaceContent\.scrollLeft = 0\)/u);
  assert.match(appSource, /querySelectorAll\("\.panel, \.preview-column"\)/u);
});

test("studio recenter optimization toggle is wired into generation stats", async () => {
  const [indexSource, stylesSource, appSource] = await Promise.all([
    readFile(path.join(webStaticRoot, "index.html"), "utf8"),
    readFile(path.join(webStaticRoot, "styles.css"), "utf8"),
    readFile(path.join(webStaticRoot, "app.js"), "utf8"),
  ]);

  assert.match(indexSource, /class="checkbox-card recenter-card hidden"[\s\S]*id="recenter-strategy-checkbox"/u);
  assert.match(indexSource, /回中优化（实验）/u);
  assert.match(stylesSource, /\.recenter-card\s*\{/u);
  assert.match(appSource, /recenterStrategy:\s*"off"/u);
  assert.match(appSource, /recenterStrategyCheckbox:\s*document\.getElementById\("recenter-strategy-checkbox"\)/u);
  assert.match(appSource, /els\.recenterStrategyCheckbox\.addEventListener\("change"/u);
  assert.match(appSource, /recenterStrategy:\s*normalizeRecenterStrategy\(state\.studio\.recenterStrategy\)/u);
  assert.match(appSource, /formatRecenterStats\(payload\.stats\.pathStats\)/u);
});
