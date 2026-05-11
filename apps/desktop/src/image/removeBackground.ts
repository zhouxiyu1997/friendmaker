import type { RawImageData, RgbColor } from "../types.js";
import { colorDistanceSquared, luminance } from "../utils/colors.js";

const TRANSPARENCY_ALPHA_THRESHOLD = 16;
const EDGE_BUCKET_SIZE = 16;
const MAX_BACKGROUND_SWATCHES = 3;
const MIN_EDGE_SAMPLE_COUNT = 8;
const MIN_EDGE_SAMPLE_RATIO = 0.08;
const COLOR_MATCH_THRESHOLD = 3_600;

function getOffset(image: RawImageData, x: number, y: number): number {
  return (y * image.width + x) * image.channels;
}

function readPixel(image: RawImageData, x: number, y: number): { rgb: RgbColor; alpha: number } {
  const offset = getOffset(image, x, y);
  return {
    rgb: {
      r: image.data[offset] ?? 0,
      g: image.data[offset + 1] ?? 0,
      b: image.data[offset + 2] ?? 0,
    },
    alpha: image.channels >= 4 ? (image.data[offset + 3] ?? 255) : 255,
  };
}

function bucketKey(color: RgbColor): string {
  return [
    Math.floor(color.r / EDGE_BUCKET_SIZE),
    Math.floor(color.g / EDGE_BUCKET_SIZE),
    Math.floor(color.b / EDGE_BUCKET_SIZE),
  ].join(",");
}

function shouldKeepAsBackgroundCandidate(color: RgbColor, ratio: number): boolean {
  const brightness = luminance(color);

  if (brightness >= 150) {
    return true;
  }

  return ratio >= 0.3;
}

function collectEdgePixels(image: RawImageData): Array<{ x: number; y: number; rgb: RgbColor; alpha: number }> {
  const samples: Array<{ x: number; y: number; rgb: RgbColor; alpha: number }> = [];
  const visited = new Set<string>();
  const pushSample = (x: number, y: number) => {
    const key = `${x},${y}`;
    if (visited.has(key)) {
      return;
    }

    visited.add(key);
    const pixel = readPixel(image, x, y);
    samples.push({ x, y, rgb: pixel.rgb, alpha: pixel.alpha });
  };

  for (let x = 0; x < image.width; x += 1) {
    pushSample(x, 0);
    pushSample(x, image.height - 1);
  }

  for (let y = 0; y < image.height; y += 1) {
    pushSample(0, y);
    pushSample(image.width - 1, y);
  }

  return samples;
}

function detectBackgroundSwatches(image: RawImageData): RgbColor[] {
  const edgePixels = collectEdgePixels(image).filter(
    (pixel) => pixel.alpha > TRANSPARENCY_ALPHA_THRESHOLD,
  );

  if (edgePixels.length === 0) {
    return [];
  }

  const buckets = new Map<
    string,
    {
      count: number;
      total: RgbColor;
    }
  >();

  for (const pixel of edgePixels) {
    const key = bucketKey(pixel.rgb);
    const entry = buckets.get(key);

    if (entry) {
      entry.count += 1;
      entry.total.r += pixel.rgb.r;
      entry.total.g += pixel.rgb.g;
      entry.total.b += pixel.rgb.b;
    } else {
      buckets.set(key, {
        count: 1,
        total: { ...pixel.rgb },
      });
    }
  }

  return Array.from(buckets.values())
    .sort((left, right) => right.count - left.count)
    .filter((entry) => {
      const ratio = entry.count / edgePixels.length;
      return (
        entry.count >= MIN_EDGE_SAMPLE_COUNT &&
        ratio >= MIN_EDGE_SAMPLE_RATIO &&
        shouldKeepAsBackgroundCandidate(
          {
            r: Math.round(entry.total.r / entry.count),
            g: Math.round(entry.total.g / entry.count),
            b: Math.round(entry.total.b / entry.count),
          },
          ratio,
        )
      );
    })
    .slice(0, MAX_BACKGROUND_SWATCHES)
    .map((entry) => ({
      r: Math.round(entry.total.r / entry.count),
      g: Math.round(entry.total.g / entry.count),
      b: Math.round(entry.total.b / entry.count),
    }));
}

function isBackgroundLike(color: RgbColor, swatches: RgbColor[]): boolean {
  return swatches.some((swatch) => colorDistanceSquared(color, swatch) <= COLOR_MATCH_THRESHOLD);
}

export function autoRemoveBackground(image: RawImageData): RawImageData {
  const swatches = detectBackgroundSwatches(image);

  if (swatches.length === 0 || image.width === 0 || image.height === 0) {
    return image;
  }

  const data = Buffer.from(image.data);
  const visited = new Uint8Array(image.width * image.height);
  const queue: Array<{ x: number; y: number }> = [];
  let head = 0;

  const tryQueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
      return;
    }

    const index = y * image.width + x;

    if (visited[index] === 1) {
      return;
    }

    visited[index] = 1;
    const pixel = readPixel({ ...image, data }, x, y);

    if (
      pixel.alpha <= TRANSPARENCY_ALPHA_THRESHOLD ||
      isBackgroundLike(pixel.rgb, swatches)
    ) {
      queue.push({ x, y });
    }
  };

  for (let x = 0; x < image.width; x += 1) {
    tryQueue(x, 0);
    tryQueue(x, image.height - 1);
  }

  for (let y = 0; y < image.height; y += 1) {
    tryQueue(0, y);
    tryQueue(image.width - 1, y);
  }

  while (head < queue.length) {
    const current = queue[head];
    head += 1;

    if (!current) {
      continue;
    }

    const offset = getOffset(image, current.x, current.y);
    if (image.channels >= 4) {
      data[offset + 3] = 0;
    }

    tryQueue(current.x + 1, current.y);
    tryQueue(current.x - 1, current.y);
    tryQueue(current.x, current.y + 1);
    tryQueue(current.x, current.y - 1);
  }

  return {
    ...image,
    data,
  };
}
