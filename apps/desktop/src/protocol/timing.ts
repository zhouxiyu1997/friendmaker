export interface InputTiming {
  buttonPressMs: number;
  inputDelayMs: number;
  homeMs: number;
}

export const DEFAULT_SAFE_INPUT_TIMING: InputTiming = {
  buttonPressMs: 100,
  inputDelayMs: 100,
  homeMs: 1800,
};

export const HID_REPEAT_INTERVAL_MS = 16;

export function parseInputConfigCommand(command: string): InputTiming | null {
  const match = /^CFG\s+INPUT\s+(\d+)\s+(\d+)\s+(\d+)$/u.exec(command.trim());

  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const buttonPressMs = Number.parseInt(match[1], 10);
  const inputDelayMs = Number.parseInt(match[2], 10);
  const homeMs = Number.parseInt(match[3], 10);

  if (
    !Number.isSafeInteger(buttonPressMs) ||
    !Number.isSafeInteger(inputDelayMs) ||
    !Number.isSafeInteger(homeMs)
  ) {
    return null;
  }

  return {
    buttonPressMs,
    inputDelayMs,
    homeMs,
  };
}

export function isControllerInputReportFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /controller input report failed/iu.test(message);
}

export function formatControllerInputFailureMessage(message: string): string {
  if (!/controller input report failed/iu.test(message)) {
    return message;
  }

  return `${message} Please reconnect the controller or switch to slower input timing before retrying.`;
}
