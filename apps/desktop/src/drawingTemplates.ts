import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import type { DrawingMask } from "./types.js";

export type DrawingTemplateCategory = "base" | "tops" | "dresses" | "bottoms" | "hats" | "other";

export interface DrawingTemplateDefinition {
  id: string;
  label: string;
  category: DrawingTemplateCategory;
  maskAssetPath: string;
  previewAssetPath: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const drawingTemplateRoot = path.join(__dirname, "web", "static", "drawing-templates");
const drawingTemplateMaskThreshold = 1;
const drawingTemplateMaskCache = new Map<string, Promise<DrawingMask | null>>();

export const DRAWING_TEMPLATES: DrawingTemplateDefinition[] = [
  {
    id: "none",
    label: "无模板（正方形）",
    category: "base",
    maskAssetPath: "drawing-templates/masks/none.png",
    previewAssetPath: "drawing-templates/previews/none.png",
  },
  {
    id: "tops-short-a",
    label: "无袖背心",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/tops-short-a.png",
    previewAssetPath: "drawing-templates/previews/tops-short-a.png",
  },
  {
    id: "hat-tall-a",
    label: "高礼帽",
    category: "hats",
    maskAssetPath: "drawing-templates/masks/hat-tall-a.png",
    previewAssetPath: "drawing-templates/previews/hat-tall-a.png",
  },
  {
    id: "tops-short-b",
    label: "短袖上衣（短摆）",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/tops-short-b.png",
    previewAssetPath: "drawing-templates/previews/tops-short-b.png",
  },
  {
    id: "tops-short-c",
    label: "短袖上衣（直摆）",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/tops-short-c.png",
    previewAssetPath: "drawing-templates/previews/tops-short-c.png",
  },
  {
    id: "tops-short-d",
    label: "短袖连衣短裙",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/tops-short-d.png",
    previewAssetPath: "drawing-templates/previews/tops-short-d.png",
  },
  {
    id: "hat-double-round",
    label: "圆顶针织帽",
    category: "hats",
    maskAssetPath: "drawing-templates/masks/hat-double-round.png",
    previewAssetPath: "drawing-templates/previews/hat-double-round.png",
  },
  {
    id: "tops-short-e",
    label: "短袖上衣（宽摆）",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/tops-short-e.png",
    previewAssetPath: "drawing-templates/previews/tops-short-e.png",
  },
  {
    id: "tops-short-f",
    label: "短袖上衣（收摆）",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/tops-short-f.png",
    previewAssetPath: "drawing-templates/previews/tops-short-f.png",
  },
  {
    id: "tops-hem-a",
    label: "A 字短裙",
    category: "dresses",
    maskAssetPath: "drawing-templates/masks/tops-hem-a.png",
    previewAssetPath: "drawing-templates/previews/tops-hem-a.png",
  },
  {
    id: "tops-hem-b",
    label: "直摆短裙",
    category: "dresses",
    maskAssetPath: "drawing-templates/masks/tops-hem-b.png",
    previewAssetPath: "drawing-templates/previews/tops-hem-b.png",
  },
  {
    id: "coat-long-a",
    label: "长袖长袍",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/coat-long-a.png",
    previewAssetPath: "drawing-templates/previews/coat-long-a.png",
  },
  {
    id: "dress-wide-a",
    label: "泡袖连衣裙",
    category: "dresses",
    maskAssetPath: "drawing-templates/masks/dress-wide-a.png",
    previewAssetPath: "drawing-templates/previews/dress-wide-a.png",
  },
  {
    id: "dress-flare-a",
    label: "宽摆半裙",
    category: "dresses",
    maskAssetPath: "drawing-templates/masks/dress-flare-a.png",
    previewAssetPath: "drawing-templates/previews/dress-flare-a.png",
  },
  {
    id: "bottoms-short-a",
    label: "短裙下摆",
    category: "bottoms",
    maskAssetPath: "drawing-templates/masks/bottoms-short-a.png",
    previewAssetPath: "drawing-templates/previews/bottoms-short-a.png",
  },
  {
    id: "bottoms-long-a",
    label: "长裤",
    category: "bottoms",
    maskAssetPath: "drawing-templates/masks/bottoms-long-a.png",
    previewAssetPath: "drawing-templates/previews/bottoms-long-a.png",
  },
  {
    id: "hat-multi-panel",
    label: "帽檐圆帽",
    category: "hats",
    maskAssetPath: "drawing-templates/masks/hat-multi-panel.png",
    previewAssetPath: "drawing-templates/previews/hat-multi-panel.png",
  },
  {
    id: "bottoms-slim-a",
    label: "直筒裙摆",
    category: "bottoms",
    maskAssetPath: "drawing-templates/masks/bottoms-slim-a.png",
    previewAssetPath: "drawing-templates/previews/bottoms-slim-a.png",
  },
  {
    id: "rect-vertical-panel-a",
    label: "竖向长幅 A",
    category: "other",
    maskAssetPath: "drawing-templates/masks/rect-vertical-panel-a.png",
    previewAssetPath: "drawing-templates/previews/rect-vertical-panel-a.png",
  },
  {
    id: "rect-horizontal-band-a",
    label: "横向长幅 A",
    category: "other",
    maskAssetPath: "drawing-templates/masks/rect-horizontal-band-a.png",
    previewAssetPath: "drawing-templates/previews/rect-horizontal-band-a.png",
  },
  {
    id: "rect-horizontal-band-b",
    label: "横向长幅 B",
    category: "other",
    maskAssetPath: "drawing-templates/masks/rect-horizontal-band-b.png",
    previewAssetPath: "drawing-templates/previews/rect-horizontal-band-b.png",
  },
  {
    id: "rect-vertical-panel-b",
    label: "竖向长幅 B",
    category: "other",
    maskAssetPath: "drawing-templates/masks/rect-vertical-panel-b.png",
    previewAssetPath: "drawing-templates/previews/rect-vertical-panel-b.png",
  },
  {
    id: "angular-three-peaks-window",
    label: "三尖窗格",
    category: "other",
    maskAssetPath: "drawing-templates/masks/angular-three-peaks-window.png",
    previewAssetPath: "drawing-templates/previews/angular-three-peaks-window.png",
  },
  {
    id: "angular-four-peaks-strip",
    label: "四尖连带",
    category: "other",
    maskAssetPath: "drawing-templates/masks/angular-four-peaks-strip.png",
    previewAssetPath: "drawing-templates/previews/angular-four-peaks-strip.png",
  },
  {
    id: "round-crown-disc",
    label: "双尖圆章",
    category: "other",
    maskAssetPath: "drawing-templates/masks/round-crown-disc.png",
    previewAssetPath: "drawing-templates/previews/round-crown-disc.png",
  },
  {
    id: "round-top-disc",
    label: "顶部圆章",
    category: "other",
    maskAssetPath: "drawing-templates/masks/round-top-disc.png",
    previewAssetPath: "drawing-templates/previews/round-top-disc.png",
  },
  {
    id: "rect-t-window",
    label: "T 字画布",
    category: "other",
    maskAssetPath: "drawing-templates/masks/rect-t-window.png",
    previewAssetPath: "drawing-templates/previews/rect-t-window.png",
  },
  {
    id: "round-floating-disc",
    label: "悬浮圆章",
    category: "other",
    maskAssetPath: "drawing-templates/masks/round-floating-disc.png",
    previewAssetPath: "drawing-templates/previews/round-floating-disc.png",
  },
  {
    id: "round-half-bowl",
    label: "半圆碗形",
    category: "other",
    maskAssetPath: "drawing-templates/masks/round-half-bowl.png",
    previewAssetPath: "drawing-templates/previews/round-half-bowl.png",
  },
  {
    id: "angular-folded-badge",
    label: "折角徽章",
    category: "other",
    maskAssetPath: "drawing-templates/masks/angular-folded-badge.png",
    previewAssetPath: "drawing-templates/previews/angular-folded-badge.png",
  },
  {
    id: "angular-diamond-strip",
    label: "连续菱格",
    category: "other",
    maskAssetPath: "drawing-templates/masks/angular-diamond-strip.png",
    previewAssetPath: "drawing-templates/previews/angular-diamond-strip.png",
  },
  {
    id: "round-ring-panel",
    label: "同心圆盘",
    category: "other",
    maskAssetPath: "drawing-templates/masks/round-ring-panel.png",
    previewAssetPath: "drawing-templates/previews/round-ring-panel.png",
  },
  {
    id: "round-double-oval",
    label: "横向双圆",
    category: "other",
    maskAssetPath: "drawing-templates/masks/round-double-oval.png",
    previewAssetPath: "drawing-templates/previews/round-double-oval.png",
  },
  {
    id: "round-stacked-double-disc",
    label: "纵向双圆",
    category: "other",
    maskAssetPath: "drawing-templates/masks/round-stacked-double-disc.png",
    previewAssetPath: "drawing-templates/previews/round-stacked-double-disc.png",
  },
];

const drawingTemplateMap = new Map(DRAWING_TEMPLATES.map((template) => [template.id, template]));

export function listDrawingTemplates(): DrawingTemplateDefinition[] {
  return DRAWING_TEMPLATES.slice();
}

export function getDrawingTemplateDefinition(templateId?: string): DrawingTemplateDefinition | null {
  if (!templateId) {
    return drawingTemplateMap.get("none") ?? null;
  }

  return drawingTemplateMap.get(templateId) ?? null;
}

export async function loadDrawingTemplateMask(
  templateId: string | undefined,
  width: number,
  height: number,
): Promise<DrawingMask | null> {
  const resolvedTemplateId = templateId ?? "none";
  const cacheKey = `${resolvedTemplateId}:${width}x${height}`;
  const cached = drawingTemplateMaskCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const next = loadDrawingTemplateMaskUncached(resolvedTemplateId, width, height);
  drawingTemplateMaskCache.set(cacheKey, next);
  return next;
}

async function loadDrawingTemplateMaskUncached(
  templateId: string,
  width: number,
  height: number,
): Promise<DrawingMask | null> {
  const definition = getDrawingTemplateDefinition(templateId);

  if (!definition) {
    throw new Error(`Unknown drawing template: ${templateId}`);
  }

  if (definition.id === "none") {
    return null;
  }

  const assetPath = resolveDrawingTemplateAssetPath(definition.maskAssetPath);
  // Packaged Electron builds serve these assets from app.asar, which sharp
  // cannot reliably open via a filesystem path. Reading into a Buffer keeps
  // both dev and packaged builds on the same code path.
  const assetBuffer = await readFile(assetPath);
  const { data, info } = await sharp(assetBuffer)
    .resize(width, height, {
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const alpha = new Uint8Array(info.width * info.height);

  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = (data[index * info.channels + 3] ?? 0) >= drawingTemplateMaskThreshold ? 255 : 0;
  }

  return {
    id: definition.id,
    width: info.width,
    height: info.height,
    alpha,
  };
}

function resolveDrawingTemplateAssetPath(assetPath: string): string {
  return path.join(drawingTemplateRoot, assetPath.replace(/^drawing-templates\//u, ""));
}
