import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const webStaticRoot = path.resolve("apps/desktop/src/web/static");

test("studio preview column keeps a shared scroller and a fixed-size canvas", async () => {
  const [indexSource, stylesSource, appSource] = await Promise.all([
    readFile(path.join(webStaticRoot, "index.html"), "utf8"),
    readFile(path.join(webStaticRoot, "styles.css"), "utf8"),
    readFile(path.join(webStaticRoot, "app.js"), "utf8"),
  ]);

  assert.match(indexSource, /<div class="preview-column">[\s\S]*<section class="panel panel-preview">/u);
  assert.match(indexSource, /<section id="official-palette-panel" class="panel panel-official-palette hidden">/u);
  assert.match(stylesSource, /--studio-preview-column-min:\s*568px;/u);
  assert.match(stylesSource, /\.workspace-content\s*\{[\s\S]*overflow-x:\s*auto;[\s\S]*overflow-y:\s*hidden;/u);
  assert.match(stylesSource, /\.page\[data-page="studio"\]\s*\{[\s\S]*width:\s*max-content;[\s\S]*min-width:\s*100%;[\s\S]*overflow:\s*visible;/u);
  assert.match(stylesSource, /\.grid\s*\{[\s\S]*width:\s*max-content;[\s\S]*min-width:\s*100%;[\s\S]*minmax\(var\(--studio-preview-column-min\),\s*var\(--layout-studio-col-2,\s*1fr\)\)/u);
  assert.match(stylesSource, /\.preview-column\s*\{[\s\S]*min-width:\s*var\(--studio-preview-column-min\);[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/u);
  assert.match(stylesSource, /\.panel-preview,\s*\.panel-official-palette\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*overflow:\s*visible;/u);
  assert.match(stylesSource, /\.panel-preview\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/u);
  assert.match(stylesSource, /\.preview-frame\s*\{[\s\S]*width:\s*calc\(520px \+ 24px\);[\s\S]*height:\s*calc\(520px \+ 24px\);/u);
  assert.match(stylesSource, /\.preview-canvas\s*\{[\s\S]*width:\s*520px;/u);
  assert.match(stylesSource, /\.preview-canvas\s*\{[\s\S]*height:\s*520px;/u);
  assert.match(stylesSource, /\.preview-canvas > img\s*\{[\s\S]*object-fit:\s*fill;/u);
  assert.doesNotMatch(stylesSource, /--preview-canvas-size/u);
  assert.doesNotMatch(appSource, /computePreviewCanvasSize/u);
  assert.doesNotMatch(appSource, /initializePreviewCanvasLayout/u);
  assert.doesNotMatch(appSource, /schedulePreviewCanvasLayoutSync/u);
  assert.match(appSource, /const STUDIO_PREVIEW_COLUMN_MIN_PX = 568;/u);
  assert.match(appSource, /minPixels:\s*\[250,\s*STUDIO_PREVIEW_COLUMN_MIN_PX,\s*190\]/u);
});

test("page switches reset the shared preview column scroll state", async () => {
  const appSource = await readFile(path.join(webStaticRoot, "app.js"), "utf8");

  assert.match(appSource, /workspaceContent:\s*document\.querySelector\("\.workspace-content"\)/u);
  assert.match(appSource, /workspaceContent\?\.scrollTo\?\.\(\{\s*left:\s*0,\s*top:\s*0,\s*behavior:\s*"smooth"\s*\}\)/u);
  assert.match(appSource, /workspaceContent\s*&&\s*\(els\.workspaceContent\.scrollLeft = 0\)/u);
  assert.match(appSource, /querySelectorAll\("\.panel, \.preview-column"\)/u);
});
