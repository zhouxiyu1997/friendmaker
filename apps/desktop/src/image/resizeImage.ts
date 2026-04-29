import sharp from "sharp";

import type { RawImageData, ResizeMode } from "../types.js";
import { loadImage, type ImageSource } from "./loadImage.js";

export async function resizeImage(
  imageSource: ImageSource,
  options: {
    width: number;
    height: number;
    resizeMode: ResizeMode;
    scalePercent?: number;
    offsetXPercent?: number;
    offsetYPercent?: number;
  },
): Promise<RawImageData> {
  const fit = options.resizeMode === "cover" ? "outside" : "inside";
  const scalePercent = normalizeScalePercent(options.scalePercent);
  const offsetXPercent = normalizeOffsetPercent(options.offsetXPercent);
  const offsetYPercent = normalizeOffsetPercent(options.offsetYPercent);
  const scaledWidth = Math.max(1, Math.round((options.width * scalePercent) / 100));
  const scaledHeight = Math.max(1, Math.round((options.height * scalePercent) / 100));
  const transparentBackground = { r: 0, g: 0, b: 0, alpha: 0 };

  const { data: resizedBuffer, info: resizedInfo } = await loadImage(imageSource)
    .resize(scaledWidth, scaledHeight, {
      fit,
      kernel: sharp.kernel.nearest,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const visibleWidth = Math.min(options.width, resizedInfo.width);
  const visibleHeight = Math.min(options.height, resizedInfo.height);
  const cropLeft = resolveOffsetStart(
    offsetXPercent,
    Math.max(0, resizedInfo.width - visibleWidth),
  );
  const cropTop = resolveOffsetStart(
    offsetYPercent,
    Math.max(0, resizedInfo.height - visibleHeight),
  );
  const placementLeft = resolveOffsetStart(
    offsetXPercent,
    Math.max(0, options.width - visibleWidth),
  );
  const placementTop = resolveOffsetStart(
    offsetYPercent,
    Math.max(0, options.height - visibleHeight),
  );
  const croppedBuffer = await sharp(resizedBuffer, {
    raw: {
      width: resizedInfo.width,
      height: resizedInfo.height,
      channels: resizedInfo.channels,
    },
  })
    .extract({
      left: cropLeft,
      top: cropTop,
      width: visibleWidth,
      height: visibleHeight,
    })
    .raw()
    .toBuffer();

  const { data, info } = await sharp({
    create: {
      width: options.width,
      height: options.height,
      channels: 4,
      background: transparentBackground,
    },
  })
    .composite([
      {
        input: croppedBuffer,
        raw: {
          width: visibleWidth,
          height: visibleHeight,
          channels: resizedInfo.channels,
        },
        left: placementLeft,
        top: placementTop,
      },
    ])
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    channels: info.channels,
    data,
  };
}

function normalizeScalePercent(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 100;
  }

  return Math.max(25, Math.min(200, Math.round(value ?? 100)));
}

function normalizeOffsetPercent(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-100, Math.min(100, Math.round(value ?? 0)));
}

function resolveOffsetStart(offsetPercent: number, availableSpace: number): number {
  if (availableSpace <= 0) {
    return 0;
  }

  const ratio = (offsetPercent + 100) / 200;
  return Math.round(availableSpace * ratio);
}
