export type ResizeMode = "contain" | "cover";
export type ColorMode = "mono" | "palette" | "official";
export type ControllerButton = "A" | "B" | "X" | "Y";
export type StartCursor = "center" | "top-left";
export type DrawingTool = "pen" | "eraser" | "fill" | "stamp" | "text" | "shape";
export type BrushSize = 1 | 3 | 7 | 13 | 19 | 27;

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface Pixel {
  x: number;
  y: number;
  colorIndex: number;
  colorHex: string;
  alpha: number;
}

export type PixelMap = Pixel[][];

export interface RawImageData {
  width: number;
  height: number;
  channels: number;
  data: Buffer;
}

export interface DrawingProfile {
  profileName: string;
  baudRate: number;
  canvasWidth: number;
  canvasHeight: number;
  resizeMode: ResizeMode;
  cellMoveDuration: number;
  inputDelay: number;
  homeDuration: number;
  buttonPressDuration: number;
  colorChangeDuration: number;
  ackTimeoutMs: number;
  commandRetryCount: number;
  reanchorEveryDraws?: number;
  drawButton: ControllerButton;
  colorMode: ColorMode;
  colorCount: number;
  monoThreshold: number;
  palette: string[];
  brushSize: BrushSize;
  startCursor: StartCursor;
  startTool: DrawingTool;
  startColorIndex: number;
  centerToTopLeftDx: number;
  centerToTopLeftDy: number;
}

export interface PixelizationResult {
  pixelMap: PixelMap;
  usedColorIndexes: number[];
}

export interface CanvasBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  maxX: number;
  maxY: number;
}

export interface ProgressUpdate {
  index: number;
  total: number;
  command: string;
}

export interface SenderControls {
  pause(): void;
  resume(): void;
  stop(): void;
}
