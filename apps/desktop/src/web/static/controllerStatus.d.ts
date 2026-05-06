export interface DerivedControllerStatus {
  tone: string;
  pill: string;
  title: string;
  detail: string;
  transport: string;
  profile: string;
  profileMode: string;
  activeProfile: string;
  deviceName: string;
  baseMac: string;
  controllerType: number | null;
  bondedDevices: number | null;
  lastGoodProfile: string;
  lastConnectionEvent: string;
  connectionFailureCount: number;
  failuresBeforeStable: number;
  lastStableDurationMs: number;
  postOpenQuietMs: number;
  postOpenQuietRemainingMs: number;
  pairingSetupTimeoutMs: number;
  connectedUnpairedMs: number;
  idlePrePairingReportMs: number;
  idleConnectedReportMs: number;
  discoverable: string;
  auth: string;
  connected: string;
  paired: string;
  pairedInferred: string;
  ready: string;
  discoverableValue: boolean | null;
  authValue: boolean | null;
  connectedValue: boolean | null;
  pairedValue: boolean | null;
  pairedInferredValue: boolean | null;
  readyValue: boolean | null;
  rawReadyValue: boolean | null;
  readyInferredValue: boolean;
  unstableValue: boolean;
  reconnectRecommendedValue: boolean;
  sendReportFailureCount: number;
  lastSendReportStatus: number | null;
  lastSendReportReason: number | null;
  lastAclDisconnectReason: number | null;
  lastDropReason: string;
  peer: string;
  initStep: string;
  initError: string;
}

export function normalizeControllerDeviceLines(lines: Array<string | null | undefined>): string[];
export function readInfoLineMap(lines: Array<string | null | undefined>): Record<string, string>;
export function boolFromInfo(value: string | null | undefined): boolean | null;
export function boolLabel(value: boolean | null, labels: [string, string]): string;
export function isControllerSendableStatus(input: {
  connected: boolean | null;
  paired: boolean | null;
  ready: boolean | null;
}): boolean;
export function shouldReuseExistingControllerConnection(status: {
  readyValue?: boolean | null;
  connectedValue?: boolean | null;
  pairedValue?: boolean | null;
  authValue?: boolean | null;
  discoverableValue?: boolean | null;
  reconnectRecommendedValue?: boolean | null;
  unstableValue?: boolean | null;
} | null | undefined): boolean;
export function deriveControllerStatus(
  lines: Array<string | null | undefined>,
): DerivedControllerStatus | null;
