import { randomBytes } from "node:crypto";

const SESSION_ID_RE = /^[0-9a-f]{8}$/iu;
const SEQUENCE_RE = /^[1-9]\d*$/u;
const OK_ACK_RE = /^OK\s+([0-9a-f]{8})\s+([1-9]\d*)$/iu;
const ERR_ACK_RE = /^ERR\s+([0-9a-f]{8})\s+([1-9]\d*)\s+(.+)$/iu;
const FRAME_RE = /^SEQ\s+([0-9a-f]{8})\s+([1-9]\d*)\s+(.+)$/iu;

export interface SequencedFrame {
  sessionId: string;
  sequence: number;
  command: string;
}

export type SequencedAck =
  | {
      type: "ok";
      sessionId: string;
      sequence: number;
    }
  | {
      type: "err";
      sessionId: string;
      sequence: number;
      message: string;
    };

function parseSequenceToken(value: string): number | null {
  if (!SEQUENCE_RE.test(value)) {
    return null;
  }

  const sequence = Number.parseInt(value, 10);
  return Number.isSafeInteger(sequence) ? sequence : null;
}

function normalizeSessionId(value: string): string | null {
  return SESSION_ID_RE.test(value) ? value.toLowerCase() : null;
}

export function createSessionId(): string {
  return randomBytes(4).toString("hex");
}

export function formatSequencedCommand(
  sessionId: string,
  sequence: number,
  command: string,
): string {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const trimmedCommand = command.trim();

  if (!normalizedSessionId) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }

  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new Error(`Invalid sequence: ${sequence}`);
  }

  if (trimmedCommand.length === 0) {
    throw new Error("Cannot frame an empty command.");
  }

  return `SEQ ${normalizedSessionId} ${sequence} ${trimmedCommand}`;
}

export function parseSequencedFrame(line: string): SequencedFrame | null {
  const match = FRAME_RE.exec(line.trim());

  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const sessionId = normalizeSessionId(match[1]);
  const sequence = parseSequenceToken(match[2]);
  const command = match[3].trim();

  if (!sessionId || sequence === null || command.length === 0) {
    return null;
  }

  return {
    sessionId,
    sequence,
    command,
  };
}

export function parseSequencedAck(line: string): SequencedAck | null {
  const cleanLine = line.trim();
  const okMatch = OK_ACK_RE.exec(cleanLine);

  if (okMatch?.[1] && okMatch[2]) {
    const sessionId = normalizeSessionId(okMatch[1]);
    const sequence = parseSequenceToken(okMatch[2]);

    if (sessionId && sequence !== null) {
      return {
        type: "ok",
        sessionId,
        sequence,
      };
    }
  }

  const errMatch = ERR_ACK_RE.exec(cleanLine);

  if (errMatch?.[1] && errMatch[2] && errMatch[3]) {
    const sessionId = normalizeSessionId(errMatch[1]);
    const sequence = parseSequenceToken(errMatch[2]);

    if (sessionId && sequence !== null) {
      return {
        type: "err",
        sessionId,
        sequence,
        message: errMatch[3].trim(),
      };
    }
  }

  return null;
}
