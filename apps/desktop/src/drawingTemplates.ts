import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import type { DrawingMask } from "./types.js";

export type DrawingTemplateCategory = "base" | "tops" | "dresses" | "bottoms" | "hats";

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
    label: "上衣模板 A",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/tops-short-a.png",
    previewAssetPath: "drawing-templates/previews/tops-short-a.png",
  },
  {
    id: "hat-tall-a",
    label: "帽子模板 A",
    category: "hats",
    maskAssetPath: "drawing-templates/masks/hat-tall-a.png",
    previewAssetPath: "drawing-templates/previews/hat-tall-a.png",
  },
  {
    id: "tops-short-b",
    label: "上衣模板 B",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/tops-short-b.png",
    previewAssetPath: "drawing-templates/previews/tops-short-b.png",
  },
  {
    id: "tops-short-c",
    label: "上衣模板 C",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/tops-short-c.png",
    previewAssetPath: "drawing-templates/previews/tops-short-c.png",
  },
  {
    id: "tops-short-d",
    label: "上衣模板 D",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/tops-short-d.png",
    previewAssetPath: "drawing-templates/previews/tops-short-d.png",
  },
  {
    id: "hat-double-round",
    label: "帽子模板 B",
    category: "hats",
    maskAssetPath: "drawing-templates/masks/hat-double-round.png",
    previewAssetPath: "drawing-templates/previews/hat-double-round.png",
  },
  {
    id: "tops-short-e",
    label: "上衣模板 E",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/tops-short-e.png",
    previewAssetPath: "drawing-templates/previews/tops-short-e.png",
  },
  {
    id: "tops-short-f",
    label: "上衣模板 F",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/tops-short-f.png",
    previewAssetPath: "drawing-templates/previews/tops-short-f.png",
  },
  {
    id: "tops-hem-a",
    label: "衣摆模板 A",
    category: "dresses",
    maskAssetPath: "drawing-templates/masks/tops-hem-a.png",
    previewAssetPath: "drawing-templates/previews/tops-hem-a.png",
  },
  {
    id: "tops-hem-b",
    label: "衣摆模板 B",
    category: "dresses",
    maskAssetPath: "drawing-templates/masks/tops-hem-b.png",
    previewAssetPath: "drawing-templates/previews/tops-hem-b.png",
  },
  {
    id: "coat-long-a",
    label: "长衣模板 A",
    category: "tops",
    maskAssetPath: "drawing-templates/masks/coat-long-a.png",
    previewAssetPath: "drawing-templates/previews/coat-long-a.png",
  },
  {
    id: "dress-wide-a",
    label: "连衣裙模板 A",
    category: "dresses",
    maskAssetPath: "drawing-templates/masks/dress-wide-a.png",
    previewAssetPath: "drawing-templates/previews/dress-wide-a.png",
  },
  {
    id: "dress-flare-a",
    label: "连衣裙模板 B",
    category: "dresses",
    maskAssetPath: "drawing-templates/masks/dress-flare-a.png",
    previewAssetPath: "drawing-templates/previews/dress-flare-a.png",
  },
  {
    id: "bottoms-short-a",
    label: "下装模板 A",
    category: "bottoms",
    maskAssetPath: "drawing-templates/masks/bottoms-short-a.png",
    previewAssetPath: "drawing-templates/previews/bottoms-short-a.png",
  },
  {
    id: "bottoms-long-a",
    label: "下装模板 B",
    category: "bottoms",
    maskAssetPath: "drawing-templates/masks/bottoms-long-a.png",
    previewAssetPath: "drawing-templates/previews/bottoms-long-a.png",
  },
  {
    id: "hat-multi-panel",
    label: "帽子模板 C",
    category: "hats",
    maskAssetPath: "drawing-templates/masks/hat-multi-panel.png",
    previewAssetPath: "drawing-templates/previews/hat-multi-panel.png",
  },
  {
    id: "bottoms-slim-a",
    label: "下装模板 C",
    category: "bottoms",
    maskAssetPath: "drawing-templates/masks/bottoms-slim-a.png",
    previewAssetPath: "drawing-templates/previews/bottoms-slim-a.png",
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

  const assetPath = resolveDrawingTemplateAssetPath(definition.maskAssetPath);
  const { data, info } = await sharp(assetPath)
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
