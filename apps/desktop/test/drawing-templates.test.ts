import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import test from "node:test";

import { listDrawingTemplates, loadDrawingTemplateMask } from "../src/drawingTemplates.js";
import { startWebServer } from "../src/web/server.js";

test("none drawing template skips file-backed mask loading", async () => {
  const mask = await loadDrawingTemplateMask("none", 256, 256);
  assert.equal(mask, null);
});

test("irregular drawing template masks reserve transparent space outside the cutout", async () => {
  const templates = listDrawingTemplates().filter((template) => template.id !== "none");

  for (const template of templates) {
    const mask = await loadDrawingTemplateMask(template.id, 256, 256);

    assert.ok(mask, `${template.id} should load a drawing mask`);

    const filledPixels = mask.alpha.reduce((total, alpha) => total + (alpha > 0 ? 1 : 0), 0);

    assert.ok(filledPixels > 0, `${template.id} should keep some drawable area`);
    assert.ok(
      filledPixels < mask.alpha.length,
      `${template.id} mask unexpectedly fills the entire 256x256 canvas`,
    );
  }
});

test("drawing template API and studio overlay agree on using mask assets", async (t) => {
  const recoverySessionsRoot = await mkdtemp(path.join(os.tmpdir(), "friendmaker-drawing-templates-"));
  const server = await startWebServer({ port: 0, recoverySessionsRoot });
  t.after(async () => {
    await server.close();
    await rm(recoverySessionsRoot, { recursive: true, force: true });
  });

  const templatesResponse = await fetch(`${server.url}/api/drawing-templates`);
  assert.equal(templatesResponse.ok, true);
  const payload = (await templatesResponse.json()) as {
    templates?: Array<{ id: string; maskUrl: string; previewUrl: string }>;
  };
  const templates = Array.isArray(payload.templates) ? payload.templates : [];

  assert.ok(templates.length > 0, "drawing template API should return templates");

  for (const template of templates) {
    assert.match(template.maskUrl, /^\/drawing-templates\/masks\/.+\.png$/u);
    assert.match(template.previewUrl, /^\/drawing-templates\/previews\/.+\.png$/u);
    assert.notEqual(template.maskUrl, template.previewUrl);
  }

  const sampleTemplate = templates.find((template) => template.id !== "none") ?? templates[0];
  assert.ok(sampleTemplate, "expected at least one drawing template");

  const [maskResponse, previewResponse, appResponse] = await Promise.all([
    fetch(`${server.url}${sampleTemplate.maskUrl}`),
    fetch(`${server.url}${sampleTemplate.previewUrl}`),
    fetch(`${server.url}/app.js`),
  ]);

  assert.equal(maskResponse.ok, true);
  assert.equal(previewResponse.ok, true);
  assert.equal(appResponse.ok, true);

  const [maskBytes, previewBytes, appSource] = await Promise.all([
    maskResponse.arrayBuffer(),
    previewResponse.arrayBuffer(),
    appResponse.text(),
  ]);

  assert.notDeepEqual(Buffer.from(maskBytes), Buffer.from(previewBytes));
  assert.match(appSource, /const maskUrl = template\?\.maskUrl \?\? "";/u);
  assert.match(appSource, /buildTemplateOverlayDataUrl\(maskUrl\);/u);
});
