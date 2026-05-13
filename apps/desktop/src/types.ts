export type ResizeMode = "contain" | "cover";
export type ColorMode = "mono" | "palette" | "official";
export type ControllerButton = "A" | "B" | "X" | "Y";
export type StartCursor = "center" | "top-left";
export type DrawingTool = "pen" | "eraser" | "fill" | "stamp" | "text" | "shape";
export type BrushSize = 1 | 3 | 7 | 13 | 19 | 27;
export type BrushShape = "square" | "round";

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

export interface DrawingMask {
  id?: string;
  width: number;
  height: number;
  alpha: Uint8Array;
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
  drawButton: ControllerButton;
  colorMode: ColorMode;
  colorCount: number;
  monoThreshold: number;
  palette: string[];
  brushSize: BrushSize;
  brushShape: BrushShape;
  startCursor: StartCursor;
  startTool: DrawingTool;
  startColorIndex: number;
  centerToTopLeftDx: number;
  centerToTopLeftDy: number;
}

export interface PaletteCalibrationSteps {
  hue: number;
  saturation: number;
  value: number;
}

export type CustomColorCalibrationSampleKind = "hue-anchor" | "problem-anchor";

export interface CustomColorCalibrationSampleDefinition {
  id: string;
  kind: CustomColorCalibrationSampleKind;
  label: string;
  targetHex: string;
  baseSteps: PaletteCalibrationSteps;
}

export interface CustomColorCalibrationSample {
  id: string;
  kind: CustomColorCalibrationSampleKind;
  label: string;
  targetHex: string;
  baseSteps: PaletteCalibrationSteps;
  adjustments: PaletteCalibrationSteps;
  finalSteps: PaletteCalibrationSteps;
  predictedHex: string;
}

export interface CustomColorCalibrationHueAnchor {
  sampleId: string;
  hue: number;
  delta: PaletteCalibrationSteps;
}

export interface CustomColorCalibrationProblemAnchor {
  sampleId: string;
  targetHex: string;
  hsv: {
    hue: number;
    saturation: number;
    value: number;
  };
  delta: PaletteCalibrationSteps;
}

export interface CustomColorCalibrationDerivedModel {
  hueAnchors: CustomColorCalibrationHueAnchor[];
  problemAnchors: CustomColorCalibrationProblemAnchor[];
  lowSaturationThreshold: number;
  problemBlendRadius: number;
}

export interface CustomColorCalibration {
  version: 1;
  enabled: boolean;
  updatedAt: string;
  samples: CustomColorCalibrationSample[];
  derivedModel: CustomColorCalibrationDerivedModel;
}

export interface PaletteCalibrationEntry {
  colorIndex: number;
  targetHex: string;
  calibratedHex: string;
  commandHex: string;
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

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface ResumeSegment {
  segmentIndex: number;
  label: string;
  colorHex: string | null;
  slotIndex: number | null;
  resumePrefixCommands: string[];
  firstCanvasPosition: CanvasPoint;
  bodyStartCommandIndex: number;
  commandEndExclusive: number;
}

export interface ResumePlan {
  inputConfigCommand: string;
  initialCursor: CanvasPoint;
  segments: ResumeSegment[];
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
